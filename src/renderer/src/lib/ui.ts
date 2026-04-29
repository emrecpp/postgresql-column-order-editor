export function cn(...values: Array<string | false | null | undefined>): string {
    return values.filter(Boolean).join(' ')
}

export const shellPanelClass =
    'overflow-hidden rounded-[20px] border border-studio-border bg-studio-shell shadow-studio select-none'

export const cardPanelClass = 'overflow-hidden rounded-2xl border border-studio-border bg-studio-panel-soft select-none'

export const sectionEyebrowClass =
    'text-[10px] tracking-[0.14em] text-studio-muted select-none'

export const subtleLabelClass =
    'text-[11px] tracking-[0.08em] text-studio-muted select-none'

export const panelTitleClass = 'text-base font-semibold tracking-[-0.02em] text-studio-text select-none'

export const panelSubtitleClass = 'text-xs text-studio-muted select-none'

export const pillClass =
    'inline-flex min-h-[28px] items-center justify-center rounded-full border border-studio-border bg-[#101010] px-2.5 text-xs text-studio-muted-strong select-none'

export const badgeClass =
    'inline-flex min-h-6 items-center rounded-full border border-studio-border bg-[#121212] px-2 text-[11px] tracking-[0.04em] text-studio-muted-strong select-none'

export const buttonBaseClass =
    'inline-flex h-9 items-center justify-center gap-2 rounded-[11px] border px-3 text-sm font-medium transition duration-150 hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0'

export const buttonGhostClass = `${buttonBaseClass} border-studio-border-strong bg-studio-panel-soft text-studio-text select-none`
export const buttonPrimaryClass = `${buttonBaseClass} border-white bg-white text-[#050505] select-none`
export const buttonDangerClass = `${buttonBaseClass} border-studio-border-strong bg-red-500 text-studio-text select-none`
export const buttonSquareClass = `${buttonGhostClass} w-9 px-0 select-none`

export const inputClass =
    'h-10 w-full rounded-[11px] border border-studio-border bg-studio-panel-soft px-3 text-sm text-studio-text outline-none transition placeholder:text-studio-muted focus:border-studio-border-strong'

export const emptyStateClass =
    'grid min-h-[140px] place-items-center rounded-2xl border border-studio-border bg-studio-panel-soft p-5 text-center text-studio-muted'

export const emptyStateCompactClass =
    'grid min-h-24 place-items-center rounded-2xl border border-studio-border bg-studio-panel-soft p-5 text-center text-studio-muted'

export const scrollbarClass =
    '[scrollbar-color:#3a3a3a_#0d0d0d] [scrollbar-width:thin] [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:rounded-full [&::-webkit-scrollbar-track]:bg-[#0d0d0d] [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:border-[2px] [&::-webkit-scrollbar-thumb]:border-[#0d0d0d] [&::-webkit-scrollbar-thumb]:bg-[#3a3a3a] hover:[&::-webkit-scrollbar-thumb]:bg-[#4a4a4a]'
