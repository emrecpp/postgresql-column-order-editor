import type { ReactNode } from 'react'
import {
    buttonDangerClass,
    buttonGhostClass,
    cn
} from '@renderer/lib/ui'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle
} from './ui/dialog'

interface ConfirmDialogProps {
    busy?: boolean
    confirmLabel?: string
    description: ReactNode
    onConfirm: () => void
    onOpenChange: (open: boolean) => void
    open: boolean
    title: string
}

function ConfirmDialog({
    busy = false,
    confirmLabel = 'Yes',
    description,
    onConfirm,
    onOpenChange,
    open,
    title
}: ConfirmDialogProps) {
    return (
        <Dialog onOpenChange={onOpenChange} open={open}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{title}</DialogTitle>
                    <DialogDescription>{description}</DialogDescription>
                </DialogHeader>

                <DialogFooter>
                    <button
                        className={cn(buttonGhostClass, 'min-w-20')}
                        disabled={busy}
                        onClick={() => onOpenChange(false)}
                        type="button"
                    >
                        No
                    </button>

                    <button
                        className={cn(
                            buttonDangerClass,
                            'bg-red-500 min-w-20 hover:bg-red-500/90'
                        )}
                        disabled={busy}
                        onClick={onConfirm}
                        type="button"
                    >
                        {confirmLabel}
                    </button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

export default ConfirmDialog
