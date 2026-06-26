import { useEffect } from 'react';

const APP_NAME = 'Ledger';

export function useDocumentTitle(pageTitle) {
  useEffect(() => {
    document.title = pageTitle ? `${pageTitle} — ${APP_NAME}` : APP_NAME;
    return () => { document.title = APP_NAME; };
  }, [pageTitle]);
}
