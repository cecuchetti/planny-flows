import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('App error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 24, fontFamily: 'sans-serif', maxWidth: 600 }}>
          <h1 style={{ color: '#c00' }}>Something went wrong</h1>
          <pre style={{ overflow: 'auto', background: '#f5f5f5', padding: 12, fontSize: 12 }}>
            {this.state.error?.toString?.()}
          </pre>
          <p>Check the browser console (F12) for more details.</p>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
