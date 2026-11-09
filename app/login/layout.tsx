import { Fraunces } from "next/font/google";

// Misma serif del wordmark y del PDF de proveedores (invoice-html.ts); solo se
// carga en el login.
const fraunces = Fraunces({ subsets: ["latin"], variable: "--font-brand", weight: ["400", "600"] });

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return <div className={fraunces.variable}>{children}</div>;
}
