import React from 'react'

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="rounded-3xl border border-rose-500/30 bg-rose-500/10 p-6 text-center text-white space-y-3 my-4">
          <div className="text-xl font-bold text-rose-400">Trading Panel Error</div>
          <p className="text-xs text-white/70 font-mono bg-black/40 p-3 rounded-xl border border-rose-500/20 max-w-lg mx-auto overflow-x-auto text-left">
            {this.state.error?.message || String(this.state.error)}
          </p>
          <button
            type="button"
            className="px-4 py-2 bg-brand text-black font-bold rounded-xl text-xs"
            onClick={() => this.setState({ hasError: false, error: null })}
          >
            Retry
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

export default ErrorBoundary
