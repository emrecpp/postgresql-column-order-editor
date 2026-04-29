import type {Config} from 'tailwindcss'

const config: Config = {
    content: ['./src/renderer/index.html', './src/renderer/src/**/*.{ts,tsx}'],
    theme: {
        extend: {
            colors: {
                studio: {
                    bg: '#050505',
                    panel: '#0d0d0d',
                    'panel-soft': '#111111',
                    'panel-strong': '#161616',
                    border: '#222222',
                    'border-strong': '#333333',
                    text: '#f5f5f5',
                    muted: '#9f9f9f',
                    'muted-strong': '#c8c8c8',
                    amber: '#ffd166',
                    'amber-soft': '#b5a76f',
                    blue: '#9ecbff',
                    green: '#7ce3b6',
                    cyan: '#7ed7ff',
                    orange: '#ff9f7a',
                    sand: '#ffbc7d',
                    frost: '#c9d3df'
                }
            },
            fontFamily: {
                sans: ['Public Sans', 'sans-serif'],
                mono: ['ui-monospace', 'SFMono-Regular', 'monospace']
            },
            boxShadow: {
                studio: '0 20px 60px rgba(0, 0, 0, 0.35)'
            },
            backgroundImage: {
                'studio-app':
                    'radial-gradient(circle at top, rgba(255, 255, 255, 0.05), transparent 24%), linear-gradient(180deg, #0a0a0a 0%, #050505 100%)',
                'studio-shell':
                    'linear-gradient(180deg, rgba(18, 18, 18, 0.95), rgba(9, 9, 9, 0.96))',
                'studio-sheen':
                    'linear-gradient(180deg, rgba(255, 255, 255, 0.035), rgba(255, 255, 255, 0.015))',
                'studio-gold':
                    'linear-gradient(180deg, rgba(255, 209, 102, 0.12), rgba(255, 209, 102, 0.05))',
                'studio-blue':
                    'linear-gradient(180deg, rgba(66, 153, 225, 0.12), rgba(66, 153, 225, 0.05))'
            },
            keyframes: {
                'dialog-overlay-in': {
                    from: {opacity: '0'},
                    to: {opacity: '1'}
                },
                'dialog-overlay-out': {
                    from: {opacity: '1'},
                    to: {opacity: '0'}
                },
                'dialog-content-in': {
                    from: {
                        opacity: '0',
                        transform: 'translate(-50%, -48%) scale(0.96)'
                    },
                    to: {
                        opacity: '1',
                        transform: 'translate(-50%, -50%) scale(1)'
                    }
                },
                'dialog-content-out': {
                    from: {
                        opacity: '1',
                        transform: 'translate(-50%, -50%) scale(1)'
                    },
                    to: {
                        opacity: '0',
                        transform: 'translate(-50%, -48%) scale(0.97)'
                    }
                }
            },
            animation: {
                'dialog-overlay-in': 'dialog-overlay-in 200ms cubic-bezier(0.16, 1, 0.3, 1)',
                'dialog-overlay-out': 'dialog-overlay-out 160ms cubic-bezier(0.4, 0, 1, 1)',
                'dialog-content-in': 'dialog-content-in 220ms cubic-bezier(0.16, 1, 0.3, 1)',
                'dialog-content-out': 'dialog-content-out 160ms cubic-bezier(0.4, 0, 1, 1)'
            }
        }
    },
    plugins: []
}

export default config
