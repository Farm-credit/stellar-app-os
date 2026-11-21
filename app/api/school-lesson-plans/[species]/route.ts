import { NextResponse } from 'next/server';
import { getLessonPlan, renderLessonPlanMarkdown } from '@/lib/schoolProgramme';

type RouteParams = { params: Promise<{ species: string }> };

/**
 * GET /api/school-lesson-plans/[species]
 *
 * Download the curriculum-linked lesson plan for a tree species as Markdown.
 */
export async function GET(_request: Request, { params }: RouteParams) {
  const { species } = await params;
  const plan = getLessonPlan(species);
  if (!plan) {
    return NextResponse.json({ error: 'Lesson plan not found' }, { status: 404 });
  }
  return new NextResponse(renderLessonPlanMarkdown(plan), {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Content-Disposition': `attachment; filename="lesson-plan-${plan.species}.md"`,
    },
  });
}
