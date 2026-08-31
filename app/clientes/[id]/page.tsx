import Dashboard from "../../Dashboard";

export default async function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <Dashboard initialSection="clientes" initialClientId={id} />;
}
