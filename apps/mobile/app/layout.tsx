export const metadata = { title: "Wrapper GPT" };
export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="es">
            <body style={{ margin: 0, background: "#0b0b0b", color: "#fff" }}>{children}</body>
        </html>
    );
}