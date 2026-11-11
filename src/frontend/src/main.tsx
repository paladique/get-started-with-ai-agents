import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './components/App';
import '@fontsource-variable/dm-sans';
import '@fontsource-variable/manrope';

class StorefrontBoundary extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error) { console.error('Storefront render failed:', error); }
  render() {
    if (this.state.failed) return <main role="alert" style={{ padding: '60px 24px', fontFamily: 'Arial, sans-serif', color: '#263f33', maxWidth: 540, margin: 'auto' }}><h1 style={{ fontSize: 28, letterSpacing: '-1px' }}>Let’s try that again.</h1><p>The storefront couldn’t load. Please reload the page.</p><button style={{ marginTop: 20, padding: '12px 20px', background: '#263f33', color: 'white', borderRadius: 4 }} onClick={() => window.location.reload()}>Reload storefront</button></main>;
    return this.props.children;
  }
}

// Mount the React app to a div with id "react-root" that we'll add to the HTML
const rootElement = document.getElementById('react-root');

if (rootElement) {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <StorefrontBoundary><App /></StorefrontBoundary>
    </React.StrictMode>
  );
} else {
  console.error('Failed to find the react-root element');
}