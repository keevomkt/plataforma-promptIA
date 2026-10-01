import { KeevoMark } from "@/components/Brand";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="sidebar-surface flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex justify-center">
          <KeevoMark size={34} />
        </div>
        <div className="overflow-hidden rounded-md border border-accent/10 bg-white shadow-pop">
          <div className="keevo-gradient h-1" />
          <div className="px-6 py-6">{children}</div>
        </div>
      </div>
    </div>
  );
}
