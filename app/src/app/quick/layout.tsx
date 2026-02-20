// No edge runtime - this is a client-only page that can be statically generated

export default function QuickLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
