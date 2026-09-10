/** Light shell so `/c/[token]` first paint is not a dark void before client CSS hydrates. */
export default function ClientPublicLayout({ children }) {
  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#e8e4dc',
        color: '#0f172a',
      }}
    >
      {children}
    </div>
  );
}
