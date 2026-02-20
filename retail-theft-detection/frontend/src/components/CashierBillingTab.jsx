import React, { useState, useEffect, useCallback, useRef } from 'react';
import api from '../services/api';

/**
 * CashierBillingTab — The cashier's billing-only view
 * 
 * Flow:
 * 1. Select products from 20-item grid → items added to cart
 * 2. System auto-calculates total (subtotal + 10% tax)
 * 3. Customer chooses: Cash or Online
 * 4. If CASH: camera verifies customer → drawer opens → enter cash received → show change
 * 5. If ONLINE: complete immediately, drawer NOT opened
 * 6. Entry saved → shown in cashier's own transaction history
 */
export default function CashierBillingTab({ user }) {
    const [products, setProducts] = useState([]);
    const [cart, setCart] = useState([]);
    const [currentTxn, setCurrentTxn] = useState(null);
    const [transactions, setTransactions] = useState([]);
    const [step, setStep] = useState('browse'); // browse | payment | cash_input | change_display | history
    const [cashReceived, setCashReceived] = useState('');
    const [changeAmount, setChangeAmount] = useState(null);
    const [drawerBalance, setDrawerBalance] = useState(null);
    const [customerVerified, setCustomerVerified] = useState(false);
    const [verifying, setVerifying] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [loading, setLoading] = useState(true);
    const audioRef = useRef(null);

    const counterId = `counter-${user.username}`;

    const loadProducts = useCallback(async () => {
        try {
            const prods = await api.getProducts();
            setProducts(prods);
        } catch (err) {
            console.error('Failed to load products:', err);
        }
    }, []);

    const loadHistory = useCallback(async () => {
        try {
            const txns = await api.getTransactions({ limit: 20 });
            setTransactions(txns);
        } catch (err) {
            console.error('Failed to load history:', err);
        }
    }, []);

    const loadBalance = useCallback(async () => {
        try {
            const bal = await api.getDrawerBalance(counterId);
            setDrawerBalance(bal.balance || 0);
        } catch (err) {
            setDrawerBalance(0);
        }
    }, [counterId]);

    useEffect(() => {
        Promise.all([loadProducts(), loadHistory(), loadBalance()]).then(() => setLoading(false));
    }, [loadProducts, loadHistory, loadBalance]);

    // ─── Play beep sound ──────────────────────────────────
    const playBeep = (type = 'success') => {
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.type = 'sine';
            osc.frequency.value = type === 'error' ? 300 : type === 'warning' ? 500 : 800;
            gain.gain.value = 0.3;
            osc.start();
            osc.stop(ctx.currentTime + (type === 'error' ? 0.5 : 0.2));
        } catch (e) { /* silent fail */ }
    };

    // ─── Cart operations ──────────────────────────────────
    const addToCart = (product) => {
        setCart(prev => {
            const existing = prev.find(c => c.product_id === product.id);
            if (existing) {
                return prev.map(c => c.product_id === product.id
                    ? { ...c, quantity: c.quantity + 1, total_price: (c.quantity + 1) * c.unit_price }
                    : c
                );
            }
            return [...prev, {
                product_id: product.id,
                product_name: product.name,
                unit_price: product.price,
                quantity: 1,
                total_price: product.price
            }];
        });
        setError('');
    };

    const removeFromCart = (productId) => {
        setCart(prev => prev.filter(c => c.product_id !== productId));
    };

    const updateQuantity = (productId, delta) => {
        setCart(prev => prev.map(c => {
            if (c.product_id !== productId) return c;
            const newQty = Math.max(1, c.quantity + delta);
            return { ...c, quantity: newQty, total_price: newQty * c.unit_price };
        }));
    };

    // ─── Calculations ─────────────────────────────────────
    const subtotal = cart.reduce((sum, c) => sum + c.total_price, 0);
    const tax = Math.round(subtotal * 0.1 * 100) / 100;
    const total = Math.round((subtotal + tax) * 100) / 100;

    // ─── Proceed to payment ───────────────────────────────
    const proceedToPayment = () => {
        if (cart.length === 0) { setError('Add items to cart first'); return; }
        setStep('payment');
        setError('');
        setSuccess('');
    };

    // ─── Online payment (no drawer) ───────────────────────
    const handleOnlinePayment = async () => {
        try {
            setError('');
            // Create transaction and add items
            const txn = await api.createTransaction();
            for (const item of cart) {
                await api.addItem(txn.id, item.product_id, item.quantity);
            }
            await api.onlinePayment(txn.id);
            playBeep('success');
            setSuccess(`✅ Online payment completed! Bill: $${total.toFixed(2)}. Drawer NOT opened.`);
            setCart([]);
            setStep('browse');
            loadHistory();
            loadBalance();
        } catch (err) {
            setError(err.message);
            playBeep('error');
        }
    };

    // ─── Cash payment flow ────────────────────────────────
    const handleCashSelected = async () => {
        setVerifying(true);
        setError('');
        try {
            // Step 1: Check if customer is present via camera
            const check = await api.checkCustomerPresence(counterId);
            if (check.customer_present) {
                setCustomerVerified(true);
                setStep('cash_input');
                playBeep('success');
            } else {
                setError('❌ No customer detected at counter! Drawer CANNOT be opened. A customer must be present for cash transactions.');
                playBeep('error');
            }
        } catch (err) {
            setError('Camera check failed: ' + err.message);
            playBeep('error');
        } finally {
            setVerifying(false);
        }
    };

    // ─── Process cash payment ─────────────────────────────
    const processCashPayment = async () => {
        const cashAmt = parseFloat(cashReceived);
        if (isNaN(cashAmt) || cashAmt < total) {
            setError(`Insufficient cash! Bill is ₹${total.toFixed(2)}, received ₹${cashAmt?.toFixed(2) || '0.00'}`);
            playBeep('error');
            return;
        }

        try {
            setError('');
            // Create transaction, add items, then process cash payment
            const txn = await api.createTransaction();
            for (const item of cart) {
                await api.addItem(txn.id, item.product_id, item.quantity);
            }

            const result = await api.cashPayment(txn.id, cashAmt, customerVerified);
            const change = Math.round((cashAmt - total) * 100) / 100;
            setChangeAmount(change);
            setDrawerBalance(result.drawer_balance);
            setStep('change_display');
            playBeep('success');
        } catch (err) {
            setError(err.message);
            playBeep('error');
        }
    };

    // ─── Complete and reset ───────────────────────────────
    const completeAndReset = () => {
        setCart([]);
        setCurrentTxn(null);
        setCashReceived('');
        setChangeAmount(null);
        setCustomerVerified(false);
        setStep('browse');
        setSuccess('');
        setError('');
        loadHistory();
        loadBalance();
    };

    // ─── Category grouping ───────────────────────────────
    const categories = [...new Set(products.map(p => p.category))];

    if (loading) {
        return <div className="text-center text-slate-500 py-20">Loading billing system...</div>;
    }

    return (
        <div className="space-y-6">
            {/* Header with drawer balance */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <h2 className="text-lg font-bold text-white">🧾 Point of Sale</h2>
                    <span className="px-3 py-1 rounded-lg bg-slate-800 border border-slate-700 text-xs text-slate-400">
                        Counter: {counterId}
                    </span>
                </div>
                <div className="flex items-center gap-3">
                    <div className="px-4 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                        <p className="text-[10px] text-emerald-500 uppercase tracking-wider">Drawer Balance</p>
                        <p className="text-lg font-bold text-emerald-400">₹{(drawerBalance || 0).toFixed(2)}</p>
                    </div>
                    <button onClick={() => setStep(step === 'history' ? 'browse' : 'history')}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition ${step === 'history'
                            ? 'bg-blue-600/20 border border-blue-500/30 text-blue-400'
                            : 'bg-slate-800 border border-slate-700 text-slate-400 hover:text-white'
                            }`}>
                        {step === 'history' ? '← Back to Billing' : '📋 My History'}
                    </button>
                </div>
            </div>

            {/* Error / Success Messages */}
            {error && (
                <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
                    {error}
                </div>
            )}
            {success && (
                <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-sm">
                    {success}
                </div>
            )}

            {/* ═══════ HISTORY VIEW ═══════ */}
            {step === 'history' && (
                <div className="glass-card overflow-hidden">
                    <div className="p-4 border-b border-slate-800/50">
                        <h3 className="text-sm font-semibold text-slate-200">My Transaction History</h3>
                    </div>
                    <table className="data-table">
                        <thead>
                            <tr className="bg-slate-900/50">
                                <th>ID</th>
                                <th>Status</th>
                                <th>Payment</th>
                                <th>Total</th>
                                <th>Cash Received</th>
                                <th>Change Given</th>
                                <th>Date</th>
                            </tr>
                        </thead>
                        <tbody>
                            {transactions.map(txn => (
                                <tr key={txn.id}>
                                    <td className="font-mono text-xs text-slate-400">{txn.id.substring(0, 8)}...</td>
                                    <td>
                                        <span className={`badge border ${txn.status === 'completed' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' :
                                            txn.status === 'voided' ? 'bg-red-500/20 text-red-400 border-red-500/30' :
                                                'bg-blue-500/20 text-blue-400 border-blue-500/30'
                                            }`}>{txn.status}</span>
                                    </td>
                                    <td>
                                        <span className={`badge border ${txn.payment_method === 'cash' ? 'bg-amber-500/20 text-amber-400 border-amber-500/30' :
                                            'bg-blue-500/20 text-blue-400 border-blue-500/30'
                                            }`}>{txn.payment_method === 'cash' ? '💵 Cash' : '📱 Online'}</span>
                                    </td>
                                    <td className="font-semibold text-slate-200">₹{txn.total.toFixed(2)}</td>
                                    <td className="text-slate-300">{txn.payment_method === 'cash' ? `₹${txn.cash_received.toFixed(2)}` : '—'}</td>
                                    <td className="text-slate-300">{txn.payment_method === 'cash' ? `₹${txn.change_given.toFixed(2)}` : '—'}</td>
                                    <td className="text-xs text-slate-400">{new Date(txn.created_at).toLocaleString()}</td>
                                </tr>
                            ))}
                            {transactions.length === 0 && (
                                <tr><td colSpan="7" className="text-center text-slate-500 py-8">No transactions yet</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            )}

            {/* ═══════ BILLING VIEW ═══════ */}
            {step !== 'history' && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Products Grid (Left) */}
                    <div className="lg:col-span-2 space-y-4">
                        {step === 'browse' && categories.map(cat => (
                            <div key={cat}>
                                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">{cat}</h3>
                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                                    {products.filter(p => p.category === cat).map(product => {
                                        const inCart = cart.find(c => c.product_id === product.id);
                                        return (
                                            <button
                                                key={product.id}
                                                onClick={() => addToCart(product)}
                                                className={`p-3 rounded-xl border text-left transition-all hover:scale-[1.02] active:scale-[0.98] ${inCart
                                                    ? 'bg-blue-500/10 border-blue-500/30 shadow-lg shadow-blue-500/5'
                                                    : 'bg-slate-900/50 border-slate-800 hover:border-slate-600'
                                                    }`}
                                            >
                                                <p className="text-sm font-medium text-slate-200 truncate">{product.name}</p>
                                                <div className="flex items-center justify-between mt-1">
                                                    <span className="text-lg font-bold text-emerald-400">${product.price.toFixed(2)}</span>
                                                    {inCart && (
                                                        <span className="px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400 text-xs font-bold">
                                                            ×{inCart.quantity}
                                                        </span>
                                                    )}
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}

                        {/* ═══════ PAYMENT METHOD SELECTION ═══════ */}
                        {step === 'payment' && (
                            <div className="glass-card p-8 text-center">
                                <h3 className="text-xl font-bold text-white mb-2">Select Payment Method</h3>
                                <p className="text-slate-400 text-sm mb-6">
                                    Bill Total: <span className="text-2xl font-bold text-emerald-400">${total.toFixed(2)}</span>
                                </p>
                                <div className="grid grid-cols-2 gap-4 max-w-md mx-auto">
                                    <button onClick={handleCashSelected} disabled={verifying}
                                        className="p-6 rounded-2xl bg-amber-500/10 border-2 border-amber-500/30 hover:bg-amber-500/20 hover:border-amber-500/50 transition-all group">
                                        <p className="text-4xl mb-2">💵</p>
                                        <p className="text-lg font-bold text-amber-400">Cash</p>
                                        <p className="text-xs text-slate-500 mt-1">Drawer will open</p>
                                        {verifying && <p className="text-xs text-blue-400 mt-2 animate-pulse">📹 Verifying customer...</p>}
                                    </button>
                                    <button onClick={handleOnlinePayment}
                                        className="p-6 rounded-2xl bg-blue-500/10 border-2 border-blue-500/30 hover:bg-blue-500/20 hover:border-blue-500/50 transition-all group">
                                        <p className="text-4xl mb-2">📱</p>
                                        <p className="text-lg font-bold text-blue-400">Online</p>
                                        <p className="text-xs text-slate-500 mt-1">UPI / Card / Wallet</p>
                                    </button>
                                </div>
                                <button onClick={() => setStep('browse')} className="mt-4 text-xs text-slate-500 hover:text-slate-300">
                                    ← Back to products
                                </button>
                            </div>
                        )}

                        {/* ═══════ CASH INPUT (after customer verified) ═══════ */}
                        {step === 'cash_input' && (
                            <div className="glass-card p-8 text-center">
                                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-500/10 border border-emerald-500/30 mb-4">
                                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                                    <span className="text-xs text-emerald-400">✅ Customer verified — Drawer authorized</span>
                                </div>
                                <h3 className="text-xl font-bold text-white mb-2">Enter Cash Received</h3>
                                <p className="text-slate-400 mb-4">Bill Amount: <span className="text-2xl font-bold text-emerald-400">₹{total.toFixed(2)}</span></p>

                                <div className="max-w-xs mx-auto">
                                    <div className="relative">
                                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-2xl text-slate-500">₹</span>
                                        <input
                                            type="number"
                                            value={cashReceived}
                                            onChange={e => setCashReceived(e.target.value)}
                                            placeholder="0.00"
                                            autoFocus
                                            className="w-full px-4 pl-10 py-4 rounded-xl bg-slate-900 border-2 border-slate-700 text-3xl text-center text-white font-bold focus:outline-none focus:border-emerald-500 transition"
                                            onKeyDown={e => e.key === 'Enter' && processCashPayment()}
                                        />
                                    </div>

                                    {cashReceived && parseFloat(cashReceived) >= total && (
                                        <div className="mt-3 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30">
                                            <p className="text-sm text-slate-400">Change to give:</p>
                                            <p className="text-3xl font-bold text-emerald-400">
                                                ₹{(parseFloat(cashReceived) - total).toFixed(2)}
                                            </p>
                                        </div>
                                    )}

                                    <button onClick={processCashPayment}
                                        className="w-full mt-4 px-6 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-lg transition">
                                        💰 Complete Cash Payment
                                    </button>
                                    <button onClick={() => { setStep('payment'); setCustomerVerified(false); setCashReceived(''); }}
                                        className="mt-2 text-xs text-slate-500 hover:text-slate-300">
                                        ← Back
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* ═══════ CHANGE DISPLAY ═══════ */}
                        {step === 'change_display' && (
                            <div className="glass-card p-8 text-center">
                                <div className="text-6xl mb-4">✅</div>
                                <h3 className="text-2xl font-bold text-white mb-2">Transaction Complete!</h3>
                                <div className="grid grid-cols-3 gap-4 max-w-lg mx-auto my-6">
                                    <div className="p-4 rounded-xl bg-slate-900/50 border border-slate-800">
                                        <p className="text-xs text-slate-500 uppercase">Bill Total</p>
                                        <p className="text-xl font-bold text-white">₹{total.toFixed(2)}</p>
                                    </div>
                                    <div className="p-4 rounded-xl bg-slate-900/50 border border-slate-800">
                                        <p className="text-xs text-slate-500 uppercase">Cash Received</p>
                                        <p className="text-xl font-bold text-blue-400">₹{parseFloat(cashReceived).toFixed(2)}</p>
                                    </div>
                                    <div className="p-4 rounded-xl bg-emerald-500/10 border-2 border-emerald-500/30">
                                        <p className="text-xs text-emerald-500 uppercase">Give Change</p>
                                        <p className="text-2xl font-bold text-emerald-400">₹{changeAmount?.toFixed(2)}</p>
                                    </div>
                                </div>
                                <p className="text-sm text-slate-400 mb-2">
                                    💰 Drawer Balance: <span className="font-bold text-amber-400">₹{(drawerBalance || 0).toFixed(2)}</span>
                                </p>
                                <p className="text-xs text-red-400 font-semibold mb-6">
                                    ⚠️ Take out exactly ₹{changeAmount?.toFixed(2)} — drawer is being monitored
                                </p>
                                <button onClick={completeAndReset}
                                    className="px-8 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-lg transition">
                                    🧾 Next Customer
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Cart (Right Sidebar) */}
                    <div className="glass-card flex flex-col h-fit sticky top-24">
                        <div className="p-4 border-b border-slate-800/50">
                            <h3 className="text-sm font-semibold text-slate-200">🛒 Current Bill</h3>
                            <p className="text-[10px] text-slate-500">{cart.length} items</p>
                        </div>

                        <div className="flex-1 overflow-y-auto p-3 space-y-2 max-h-[400px]">
                            {cart.map(item => (
                                <div key={item.product_id} className="flex items-center gap-2 p-2 rounded-lg bg-slate-900/50 border border-slate-800/30">
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm text-slate-200 truncate">{item.product_name}</p>
                                        <p className="text-xs text-slate-500">₹{item.unit_price.toFixed(2)} each</p>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <button onClick={() => updateQuantity(item.product_id, -1)}
                                            className="w-6 h-6 rounded bg-slate-800 text-slate-400 hover:bg-slate-700 text-xs">−</button>
                                        <span className="w-8 text-center text-sm font-bold text-white">{item.quantity}</span>
                                        <button onClick={() => updateQuantity(item.product_id, 1)}
                                            className="w-6 h-6 rounded bg-slate-800 text-slate-400 hover:bg-slate-700 text-xs">+</button>
                                    </div>
                                    <p className="text-sm font-bold text-emerald-400 w-16 text-right">₹{item.total_price.toFixed(2)}</p>
                                    <button onClick={() => removeFromCart(item.product_id)}
                                        className="text-red-500/50 hover:text-red-400 text-sm ml-1">✕</button>
                                </div>
                            ))}
                            {cart.length === 0 && (
                                <p className="text-center text-slate-600 text-sm py-8">Select products to start billing</p>
                            )}
                        </div>

                        {/* Totals */}
                        <div className="p-4 border-t border-slate-800/50 space-y-2">
                            <div className="flex justify-between text-sm text-slate-400">
                                <span>Subtotal</span><span>₹{subtotal.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between text-sm text-slate-400">
                                <span>Tax (10%)</span><span>₹{tax.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between text-lg font-bold pt-2 border-t border-slate-700">
                                <span className="text-white">Total</span>
                                <span className="text-emerald-400">₹{total.toFixed(2)}</span>
                            </div>

                            {step === 'browse' && (
                                <button onClick={proceedToPayment} disabled={cart.length === 0}
                                    className={`w-full mt-3 py-3 rounded-xl font-bold text-lg transition ${cart.length > 0
                                        ? 'bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white shadow-lg shadow-blue-500/20'
                                        : 'bg-slate-800 text-slate-600 cursor-not-allowed'
                                        }`}>
                                    💳 Proceed to Payment
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
