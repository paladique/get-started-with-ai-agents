import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import catalog from '../../../api/data/catalog.json';
import { Landscape, ProductArt } from './storefront/ProductArt';
import './storefront/storefront.css';
import DemoStudio from './storefront/DemoStudio';

type Product = typeof catalog[number];
type Cart = Record<number, number>;
const money = (value: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2, minimumFractionDigits: 0 }).format(value);
const groups = ['All gear', 'Tents', 'Backpacks', 'Clothing', 'Footwear', 'Camp kitchen', 'Camp furniture', 'Sleep & comfort', 'Everyday'];
const storageKey = 'fieldwork-cart-v1';
function readCart(): Cart {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(storageKey) || '{}');
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return Object.fromEntries(Object.entries(value).filter(([id, qty]) => catalog.some(p => p.id === Number(id) && p.price !== null) && Number.isInteger(qty) && Number(qty) > 0 && Number(qty) <= 99));
  } catch { return {}; }
}
function Icon({ name, size = 20 }: { name: 'bag' | 'search' | 'arrow' | 'close' | 'plus' | 'minus' | 'mountain' | 'check'; size?: number }) {
  const paths = { bag: <><path d="M5 7h14l1 14H4L5 7Z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/></>, search: <><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></>, arrow: <><path d="M4 12h16m-6-6 6 6-6 6"/></>, close: <path d="m6 6 12 12M6 18 18 6"/>, plus: <path d="M5 12h14M12 5v14"/>, minus: <path d="M5 12h14"/>, mountain: <><path d="m2 20 8-15 5 8 3-5 5 12Z"/><path d="m7 11 3 2 3-3"/></>, check: <path d="m5 12 4 4L20 5"/> };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}
function Modal({ children, onClose, label, drawer = false }: { children: ReactNode; onClose: () => void; label: string; drawer?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const dialog = ref.current; dialog?.showModal(); return () => dialog?.close(); }, []);
  return <dialog ref={ref} className={drawer ? 'modal cart-drawer' : 'modal product-dialog'} aria-label={label} onCancel={e => { e.preventDefault(); onClose(); }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}><div className="modal-inner"><button className="icon-button modal-close" onClick={onClose} aria-label="Close"><Icon name="close"/></button>{children}</div></dialog>;
}
export default function App() {
  const [studioOpen, setStudioOpen] = useState(false);
  const [category, setCategory] = useState('All gear');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('featured');
  const [cart, setCart] = useState<Cart>(readCart);
  const [selected, setSelected] = useState<Product | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [checkout, setCheckout] = useState(false);
  const [complete, setComplete] = useState(false);
  const [notice, setNotice] = useState('');
  useEffect(() => { try { localStorage.setItem(storageKey, JSON.stringify(cart)); } catch { /* The cart still works when storage is unavailable. */ } }, [cart]);
  useEffect(() => { if (!notice) return; const timer = window.setTimeout(() => setNotice(''), 2600); return () => window.clearTimeout(timer); }, [notice]);
  const products = useMemo(() => {
    const query = search.trim().toLowerCase();
    const filtered = catalog.filter(p => (category === 'All gear' || p.group === category) && `${p.name} ${p.brand} ${p.category} ${p.features.join(' ')}`.toLowerCase().includes(query));
    if (sort === 'low') filtered.sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity));
    if (sort === 'high') filtered.sort((a, b) => a.price === null ? 1 : b.price === null ? -1 : b.price - a.price);
    if (sort === 'name') filtered.sort((a, b) => a.name.localeCompare(b.name));
    if (sort === 'featured') { const order = [8,9,3,4,15,16,7,6]; const rank = (id: number) => order.includes(id) ? order.indexOf(id) : 99; filtered.sort((a,b) => rank(a.id) - rank(b.id)); }
    return filtered;
  }, [category, search, sort]);
  const items = catalog.filter(p => cart[p.id] && p.price !== null);
  const count = items.reduce((sum,p) => sum + cart[p.id], 0);
  const total = items.reduce((sum,p) => sum + (p.price || 0) * cart[p.id], 0);
  const add = (product: Product) => {
    if (product.price === null) return;
    if ((cart[product.id] || 0) >= 99) { setNotice('You can add up to 99 of each item.'); return; }
    setCart(previous => ({ ...previous, [product.id]: Math.min(99, (previous[product.id] || 0) + 1) }));
    setNotice(`${product.name} added to your bag`);
  };
  const changeQuantity = (id: number, change: number) => setCart(previous => {
    const next = { ...previous }; const quantity = (next[id] || 0) + change;
    if (quantity <= 0) delete next[id]; else next[id] = Math.min(99, quantity);
    return next;
  });
  const openBag = () => { setCheckout(false); setComplete(false); setCartOpen(true); };
  const browse = (group: string) => { setCategory(group); setSearch(''); document.getElementById('shop')?.scrollIntoView({ behavior: 'smooth' }); };
  return <>
    <div className="announcement">A little less indoors. A little more adventure. <span>Find your next outside <span aria-hidden="true">↗</span></span></div>
    <div className="presentation-banner"><div><strong>IGNITE 2026</strong><span>Trace every step. Evaluate every outcome.</span></div><button onClick={() => setStudioOpen(true)}>Open demo studio ↗</button></div>
    <header className="site-header"><a className="wordmark" href="#" aria-label="Fieldwork home"><span className="brand-mark"><Icon name="mountain" size={28}/></span>fieldwork<span className="wordmark-dot">.</span></a><nav aria-label="Main navigation"><a href="#shop" className="nav-active" onClick={() => setCategory('All gear')}>Shop all</a><a href="#shop" onClick={() => browse('Tents')}>Camp</a><a href="#shop" onClick={() => browse('Backpacks')}>Hike</a><a href="#our-story">Our story</a></nav><div className="header-account"><button className="demo-shopper" onClick={() => setStudioOpen(true)}><span>AM</span>Alex · Demo shopper</button><button className="bag-button" onClick={openBag}><Icon name="bag"/><span>Bag</span><span className="bag-count">{count}</span></button></div></header>
    <main>
      <section className="hero" aria-labelledby="hero-heading"><div className="hero-copy"><span className="eyebrow"><span className="little-line"/> FOR THE WAY OUT THERE</span><h1 id="hero-heading">Good gear.<br/>Great <em>outdoors.</em></h1><p>From the first mile to the last campfire.<br/>Find a little something for your next adventure.</p><a className="primary-button" href="#shop">Explore the collection <Icon name="arrow"/></a><div className="hero-footnote"><span className="tiny-mountain">△</span> Made for moments beyond the everyday.</div></div><div className="hero-art"><Landscape/><div className="scene-caption"><span>TAKE THE SCENIC ROUTE</span><span>01 / THE GREAT OUTSIDE</span></div></div></section>
      <div className="collection-strip"><span><Icon name="mountain"/> Gear for every kind of outside</span><span>20 products. Countless possibilities.</span><a href="#shop">Find your essentials <Icon name="arrow" size={16}/></a></div>
      <section id="shop" className="shop-section" aria-labelledby="shop-heading"><div className="shop-heading"><div><span className="eyebrow">YOUR NEXT ADVENTURE STARTS HERE</span><h2 id="shop-heading">A good place to gear up.</h2></div><p>Pack a bag. Pitch a tent.<br/>Make yourself at home out there.</p></div>
        <div className="shop-toolbar"><label className="search-box"><Icon name="search"/><input type="search" placeholder="Find your next favorite…" value={search} onChange={e => setSearch(e.target.value)} aria-label="Search products"/>{search && <button className="clear-search" onClick={() => setSearch('')} aria-label="Clear search"><Icon name="close" size={16}/></button>}</label><label className="sort-box">Sort by <select value={sort} onChange={e => setSort(e.target.value)} aria-label="Sort products"><option value="featured">Featured</option><option value="low">Price: low to high</option><option value="high">Price: high to low</option><option value="name">Name: A to Z</option></select></label></div>
        <div className="category-list" role="group" aria-label="Product categories">{groups.map(group => <button key={group} aria-pressed={category === group} className={category === group ? 'category active' : 'category'} onClick={() => setCategory(group)}>{group}</button>)}</div>
        <div className="results-line"><span>{category === 'All gear' ? 'The whole collection' : category}{search && ` · “${search}”`}</span><span aria-live="polite">{products.length} {products.length === 1 ? 'product' : 'products'}</span></div>
        <div className="product-grid">{products.map(product => <article className="product-card" key={product.id}>
          <button className={`product-visual tone-${product.id % 4}`} onClick={() => setSelected(product)} aria-label={`View ${product.name}`}><span className="product-tag">{product.group}</span><ProductArt kind={product.kind} id={product.id}/><span className="quick-view">Take a closer look <Icon name="arrow" size={16}/></span></button>
          <div className="product-meta"><span>{product.brand}</span><span>No. {String(product.id).padStart(2,'0')}</span></div><h3><button onClick={() => setSelected(product)}>{product.name}</button></h3><p className="product-description">{product.description}</p><div className="product-bottom"><span className="price">{product.price === null ? <span className="price-request">Price on request</span> : money(product.price)}</span><button className="add-button" aria-label={product.price === null ? `Details for ${product.name}` : `Add ${product.name} to bag`} onClick={() => product.price === null ? setSelected(product) : add(product)}>{product.price === null ? 'Details' : 'Add to bag'}<Icon name={product.price === null ? 'arrow' : 'plus'} size={16}/></button></div>
        </article>)}</div>
        {!products.length && <div className="empty-results"><Icon name="search" size={36}/><h3>No trails found here.</h3><p>Try a different search or explore the whole collection.</p><button className="primary-button" onClick={() => { setCategory('All gear'); setSearch(''); }}>Show all gear <Icon name="arrow"/></button></div>}
      </section>
      <section id="our-story" className="story"><div className="story-symbol"><Icon name="mountain" size={74}/></div><div><span className="eyebrow">LESS SCROLLING. MORE EXPLORING.</span><h2>The best plans<br/>start with getting outside.</h2><p>A collection of practical companions for camp, trail, and everything in between. From familiar outdoor essentials to a few clever comforts, find the gear that fits your kind of adventure.</p><a href="#shop" className="text-link">Make your next plan <Icon name="arrow" size={18}/></a></div><span className="story-stamp">TAKE<br/>THE LONG<br/>WAY HOME <span>↗</span></span></section>
    </main>
    <footer><a className="wordmark" href="#">fieldwork<span className="wordmark-dot">.</span></a><p>A little gear. A lot of possibility.</p><span>Demo storefront · No real purchases</span><a href="#shop">Back to the collection ↑</a></footer>
    <button className="assistant-launcher" onClick={() => setStudioOpen(true)}><span>f.</span>Try the shopping assistant<span>↗</span></button>
    {studioOpen && <DemoStudio onClose={() => setStudioOpen(false)}/>}
    {notice && <div className="toast" role="status"><Icon name="check" size={18}/>{notice}</div>}
    {selected && <Modal label={selected.name} onClose={() => setSelected(null)}><div className="product-detail"><div className={`detail-art tone-${selected.id % 4}`}><ProductArt kind={selected.kind} id={selected.id}/><span>Product illustration</span></div><div className="detail-copy"><span className="eyebrow">{selected.brand} / {selected.category}</span><h2>{selected.name}</h2><span className="detail-price">{selected.price === null ? 'Price on request' : money(selected.price)}</span><p>{selected.price === null ? 'This product is part of the collection, but its source document does not list a price. It cannot be added to the demo bag.' : 'A closer look at what makes this piece a companion for your next adventure.'}</p><h3>The details</h3><ul>{selected.features.map(feature => <li key={feature}>{feature}</li>)}</ul>{selected.price !== null && <button className="primary-button" onClick={() => add(selected)}>Add to bag <Icon name="plus"/></button>}{notice && <p role="status" className="detail-status">{notice}</p>}<span className="source-note">From the original product catalog · Item {selected.id}</span></div></div></Modal>}
    {cartOpen && <Modal label={complete ? 'Demo order complete' : checkout ? 'Review demo order' : 'Your shopping bag'} drawer onClose={() => setCartOpen(false)}><div className="cart-content"><span className="eyebrow">YOUR NEXT ADVENTURE</span><h2>{complete ? 'Happy trails.' : checkout ? 'One last look.' : 'In the bag.'}<span>{!complete && ` (${count})`}</span></h2>
      {complete ? <div className="cart-empty"><div className="success-circle"><Icon name="check" size={32}/></div><h3>Your demo order is complete.</h3><p>No payment was collected and nothing will be shipped. Your bag has been cleared, ready for another adventure.</p><button className="primary-button" onClick={() => setCartOpen(false)}>Keep exploring <Icon name="arrow"/></button></div> : items.length ? <><p className="cart-intro">{checkout ? 'This is a demo order. No payment, shipping, or personal information is required.' : 'A few good things for wherever you’re headed.'}</p><div className="cart-items">{items.map(product => <div className="cart-item" key={product.id}><div className={`cart-art tone-${product.id % 4}`}><ProductArt kind={product.kind} id={product.id}/></div><div className="cart-item-copy"><span>{product.brand}</span><h3>{product.name}</h3><strong>{money((product.price || 0) * cart[product.id])}</strong><div className="quantity"><button aria-label={`Decrease quantity of ${product.name}`} onClick={() => changeQuantity(product.id, -1)}><Icon name="minus" size={14}/></button><span aria-label={`Quantity of ${product.name}`}>{cart[product.id]}</span><button disabled={cart[product.id] >= 99} aria-label={`Increase quantity of ${product.name}`} onClick={() => changeQuantity(product.id, 1)}><Icon name="plus" size={14}/></button></div></div><button className="remove-item" aria-label={`Remove ${product.name}`} onClick={() => setCart(previous => { const next = { ...previous }; delete next[product.id]; return next; })}><Icon name="close" size={16}/></button></div>)}</div><div className="cart-summary"><div><span>Subtotal</span><strong>{money(total)}</strong></div><p>Demo prices in USD. No taxes, shipping, or payments are processed.</p><button className="primary-button" onClick={() => { if (checkout) { setCart({}); setComplete(true); } else setCheckout(true); }}>{checkout ? 'Complete demo order' : 'Review demo order'} <Icon name="arrow"/></button>{checkout && <button className="back-to-bag" onClick={() => setCheckout(false)}>Back to bag</button>}</div></> : <div className="cart-empty"><Icon name="bag" size={50}/><h3>A little room for adventure.</h3><p>Your bag is empty. Find something for your next day outside.</p><button className="primary-button" onClick={() => { setCartOpen(false); browse('All gear'); }}>Explore the collection <Icon name="arrow"/></button></div>}
    </div></Modal>}
  </>;
}
