import { and, desc, eq, sql } from "drizzle-orm";
import jobsData from "../../../data/jobs.json";
import { getDb } from "../../../db";
import { applications } from "../../../db/schema";

const allowedStatuses = new Set([
  "applying",
  "needs-review",
  "submitted",
  "paused",
  "skipped",
]);

function errorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "Unexpected error";
  const detail =
    error instanceof Error && error.cause instanceof Error ? error.cause.message : "";
  const combined = `${message}\n${detail}`;

  if (combined.includes("no such table") || combined.includes('from "applications"')) {
    return "Application status storage is unavailable.";
  }

  return message;
}

export async function DELETE(request: Request) {
  try {
    const payload = (await request.json()) as { jobId?: string };
    const jobId = payload.jobId?.trim() ?? "";
    const job = jobsData.find((candidate) => candidate.id === jobId);

    if (!job) {
      return Response.json({ error: "Unknown job" }, { status: 404 });
    }

    const db = await getDb();
    const [removed] = await db
      .delete(applications)
      .where(
        and(
          eq(applications.id, jobId),
          eq(applications.status, "skipped"),
        ),
      )
      .returning({ id: applications.id });

    if (!removed) {
      return Response.json({ error: "Application status not found" }, { status: 404 });
    }

    return Response.json(removed);
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}

export async function GET() {
  try {
    const db = await getDb();
    const rows = await db
      .select({
        id: applications.id,
        company: applications.company,
        role: applications.role,
        status: applications.status,
      })
      .from(applications)
      .orderBy(desc(applications.updatedAt));

    return Response.json({ applications: rows });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as { jobId?: string; status?: string };
    const jobId = payload.jobId?.trim() ?? "";
    const status = payload.status?.trim() ?? "";
    const job = jobsData.find((candidate) => candidate.id === jobId);

    if (!job) {
      return Response.json({ error: "Unknown job" }, { status: 404 });
    }
    if (!allowedStatuses.has(status)) {
      return Response.json({ error: "Invalid application status" }, { status: 400 });
    }

    const db = await getDb();
    const [application] = await db
      .insert(applications)
      .values({
        id: job.id,
        company: job.company,
        role: job.role,
        status,
      })
      .onConflictDoUpdate({
        target: applications.id,
        set: {
          company: job.company,
          role: job.role,
          status,
          updatedAt: sql`CURRENT_TIMESTAMP`,
        },
      })
      .returning({
        id: applications.id,
        company: applications.company,
        role: applications.role,
        status: applications.status,
      });

    return Response.json({ application });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}
