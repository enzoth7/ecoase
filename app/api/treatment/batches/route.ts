import { recordTreatmentBatch } from "../../store";
import type { CreateTreatmentBatchInput, TreatmentControlResult } from "../../../treatment";

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const controls = Array.isArray(body.controls) ? body.controls.map((item) => item as Record<string, unknown>).map((item) => ({
      controlId: typeof item.controlId === "string" || typeof item.controlId === "number" ? item.controlId : "",
      result: item.result as TreatmentControlResult,
      note: typeof item.note === "string" ? item.note : undefined,
    })) : [];
    const input: CreateTreatmentBatchInput = {
      productId: typeof body.productId === "string" ? body.productId : "",
      clientProductId: typeof body.clientProductId === "string" || typeof body.clientProductId === "number" ? body.clientProductId : undefined,
      orderLineId: typeof body.orderLineId === "string" && body.orderLineId ? body.orderLineId : undefined,
      quantity: Number(body.quantity),
      performedAt: typeof body.performedAt === "string" ? body.performedAt : "",
      responsible: typeof body.responsible === "string" ? body.responsible : "",
      note: typeof body.note === "string" ? body.note : undefined,
      controls,
    };
    if (!input.productId || !Number.isInteger(input.quantity) || input.quantity <= 0 || !input.responsible.trim() || Number.isNaN(Date.parse(input.performedAt)) || controls.some((control) => !control.controlId || !["pass", "fail"].includes(control.result))) {
      return Response.json({ error: "Revise producto, cantidad, momento, responsable y controles." }, { status: 400 });
    }
    return Response.json({ result: await recordTreatmentBatch(input) }, { status: 201 });
  } catch (error) {
    const status = typeof error === "object" && error && "status" in error ? Number(error.status) : 400;
    return Response.json({ error: error instanceof Error ? error.message : "No se pudo registrar el marcado." }, { status: Number.isFinite(status) ? status : 400 });
  }
}
