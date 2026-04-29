import '@fontsource/public-sans/400.css'
import '@fontsource/public-sans/500.css'
import '@fontsource/public-sans/600.css'
import '@fontsource/public-sans/700.css'
import {APP_DISPLAY_NAME} from '@shared/app'
import {StrictMode} from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './tailwind.css'

const rootElement = document.getElementById('root') as HTMLElement

document.documentElement.className = 'h-full bg-studio-bg font-sans'
document.body.className =
    'h-full overflow-hidden bg-studio-app text-studio-text subpixel-antialiased [text-rendering:optimizeLegibility] max-[980px]:overflow-auto'
rootElement.className = 'h-full'
document.title = APP_DISPLAY_NAME

window.api
    .getAppInfo()
    .then((appInfo) => {
        document.title = appInfo.title
        document.body.dataset.appVersion = appInfo.version
    })
    .catch((error: unknown) => {
        console.error('[app] Failed to load app info.', error)
    })

ReactDOM.createRoot(rootElement).render(
    <StrictMode>
        <App />
    </StrictMode>
)
