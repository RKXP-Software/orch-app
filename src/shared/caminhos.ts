export const nomePasta = (c: string) => c.split(/[\\/]/).filter(Boolean).pop() ?? c
