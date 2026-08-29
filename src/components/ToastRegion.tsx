export const ToastRegion = ({ message }: { message: string }) => (
  <div className="toast-region" aria-live="polite" aria-atomic="true">
    {message ? <div className="toast">{message}</div> : null}
  </div>
);
