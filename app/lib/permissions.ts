import { UserRole } from "~/db/schema";
import { isUserEnrolled } from "~/services/enrollmentService";

// ─── Shared permission predicates ───

export type Viewer = { id: number; role: UserRole };
export type ViewableCourse = { id: number; instructorId: number };

/**
 * Can this user VIEW the given lesson's course?
 * admin OR the course's instructor OR an enrolled student.
 * Shared by the lesson view-gate and the comment actions.
 */
export function canViewLesson(user: Viewer, course: ViewableCourse): boolean {
  if (user.role === UserRole.Admin) return true;
  if (course.instructorId === user.id) return true;
  return isUserEnrolled(user.id, course.id);
}

/** Admins and instructors are "staff". Only staff may reply to comments. */
export function isStaff(user: Viewer): boolean {
  return user.role === UserRole.Admin || user.role === UserRole.Instructor;
}
