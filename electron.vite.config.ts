import react from '@vitejs/plugin-react';
import {codeInspectorPlugin} from 'code-inspector-plugin';
import {defineConfig, externalizeDepsPlugin} from 'electron-vite';
import {resolve} from 'node:path';

export default defineConfig({
    main: {
        plugins: [externalizeDepsPlugin()],
        resolve: {
            alias: {
                '@shared': resolve(__dirname, 'src/shared')
            }
        }
    },
    preload: {
        plugins: [externalizeDepsPlugin()],
        resolve: {
            alias: {
                '@shared': resolve(__dirname, 'src/shared')
            }
        }
    },
    renderer: {
        root: resolve(__dirname, 'src/renderer'),
        plugins: [react(),
        codeInspectorPlugin({
            bundler: 'vite',
        }),
        ],
        resolve: {
            alias: {
                '@renderer': resolve(__dirname, 'src/renderer/src'),
                '@shared': resolve(__dirname, 'src/shared')
            }
        }
    }
})
