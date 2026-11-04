export type Course = { id: number; name: string; code: string; subs: number };
export type Category = { id: number; name: string; sub: string; course_id: number | false; course: string; kind: "student" | "teacher"; color: string; hat: boolean; hat_label: string; seat_mode: "auto" | "manual"; self_select: boolean; seat_block_id: number | false; seat_block: string };
export type EventInfo = { id: number; name: string; date: string; time: string; venue: string; state: "draft" | "open" | "closed"; reg_student_open: boolean; reg_teacher_open: boolean; teacher_needs_approval: boolean; frontend_url: string; frontend_url_teacher: string; wa_seat_hat_param: boolean; wa_tpl_confirm: string; wa_tpl_seat: string; wa_msg_confirm: string; wa_msg_seat: string; wa_tpl_confirm_teacher: string; wa_tpl_seat_teacher: string; wa_msg_confirm_teacher: string; wa_msg_seat_teacher: string };
export type Participant = {
  id: number; name: string; phone: string; kind: "student" | "teacher"; place: string; institution: string;
  state: "registered" | "checked_in"; approval_state: "pending" | "approved" | "rejected";
  match_status: "na" | "matched" | "name_mismatch" | "category_mismatch" | "not_listed"; match_note: string;
  category: Category | null; claimed_category: Category | null; seat: string; seat_id: number | false; reserved_seat: string; reserved_seat_id: number | false; checkin_on: string;
  hat_state: "none" | "issued" | "returned" | "lost"; wa_state: string; registered_via: string; create_date: string;
  email?: string; note?: string; token?: string; hat_issued_on?: string; hat_returned_on?: string; checkin_by?: string; approved_by?: string;
  expected?: { name: string; category: string } | null;
  messages?: { id: number; type: string; state: string; error: string; created: string; retries: number }[];
  already?: boolean;
};
export type Block = { id: number; name: string; prefix: string; start_no: number; end_no: number; total: number; occupied: number; free: number };
export type Seat = { id: number; label: string; number: number; block_id: number; blocked: boolean; reserved_for?: string; occupant: { id: number; name: string; kind: string } | null };
