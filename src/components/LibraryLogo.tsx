export function LibraryLogo({ className = '' }: { className?: string }) {
  return (
    <span className={`library-logo ${className}`}>
      <img src="/ms-library-logo.png" alt="MS Digital Library logo" width={2000} height={2000} />
    </span>
  )
}
