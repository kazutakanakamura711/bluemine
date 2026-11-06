export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-50 px-6 text-zinc-950">
      <div className="w-full max-w-2xl rounded-xl bg-white p-8 shadow-sm">
        <p className="text-sm font-medium text-zinc-600">Bluemine</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">
          開発環境を準備しました
        </h1>
        <p className="mt-4 leading-7 text-zinc-700">
          Web は localhost:3000、API は localhost:3001/api/health で起動します。
        </p>
        <p className="mt-2 leading-7 text-zinc-700">
          次は Project の最初の API を小さく実装します。
        </p>
      </div>
    </main>
  );
}
