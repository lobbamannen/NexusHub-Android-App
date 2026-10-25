export const invalid = (message) => Object.assign(new Error(message), { status: 400 });
export function apiFailure(error) { const status = Number(error?.status); if (Number.isInteger(status) && status >= 400 && status < 500)
    return { status, message: error.message || 'Ogiltig begäran.' }; console.error('Nexus API operation failed', error?.name || 'Error'); return { status: 500, message: 'Ett internt serverfel inträffade. Kontrollera aktuellt innehåll innan du försöker spara igen.' }; }
