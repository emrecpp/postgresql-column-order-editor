export const APP_ID = 'com.postgresql-column-order-editor'
export const APP_DISPLAY_NAME = 'PostgreSQL Column Order Editor'

export function formatAppTitle(version: string): string {
    return `${APP_DISPLAY_NAME} | v${version}`
}
