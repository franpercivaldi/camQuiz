import Link from "next/link";
export default function Home() {
    return (
        <main style={{ padding: 16 }}>
            <h1>Wrapper GPT</h1>
            <p>App móvil para responder MC/VF a partir de foto.</p>
            <Link href="/camera">Ir a Cámara</Link>
        </main>
    );
}