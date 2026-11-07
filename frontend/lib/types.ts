export type Course = { id: number; name: string; code: string; subs: number; sequence: number };
export type KitItem = { id: number; name: string; quantity: number; needed: number; given: number; out: number; returned: number; lost: number; available: number; to_give: number; short: number };
export type Category = { id: number; name: string; item_ids: number[]; items: { id: number; name: string }[]; sub: string; course_id: number | false; course: string; kind: "student" | "teacher"; color: string; hat: boolean; hat_label: string; seat_mode: "auto" | "manual"; self_select: boolean; seat_block_id: number | false; seat_block: string; seat_from: number; seat_to: number; sequence: number; course_sequence: number; stage_closed: boolean };
export type FormMode = "off" | "optional" | "required";
export type FormCfg = { place: FormMode; institution: FormMode; email: FormMode; photo: FormMode; food_pref: FormMode; accompany: FormMode; instagram: FormMode };
export type EventInfo = { id: number; name: string; slug: string; date: string; time: string; venue: string; state: "draft" | "open" | "closed"; reg_student_open: boolean; reg_teacher_open: boolean; teacher_needs_approval: boolean; frontend_url: string; frontend_url_teacher: string; wa_seat_hat_param: boolean; wa_tpl_stage_done: string; wa_tpl_stage_late: string; form_student: FormCfg; form_teacher: FormCfg; wa_tpl_confirm: string; wa_tpl_seat: string; wa_msg_confirm: string; wa_msg_seat: string; wa_tpl_confirm_teacher: string; wa_tpl_seat_teacher: string; wa_msg_confirm_teacher: string; wa_msg_seat_teacher: string };
export type Participant = {
  id: number; name: string; phone: string; kind: "student" | "teacher"; place: string; institution: string;
  state: "registered" | "checked_in"; approval_state: "pending" | "approved" | "rejected";
  match_status: "na" | "matched" | "name_mismatch" | "category_mismatch" | "not_listed"; match_note: string;
  category: Category | null; claimed_category: Category | null; seat: string; seat_row: number; seat_row_name: string; instagram: string; seat_id: number | false; reserved_seat: string; reserved_seat_id: number | false; has_preset: boolean; checkin_on: string;
  hat_state: "none" | "issued" | "returned" | "lost"; food_pref: "" | "veg" | "nonveg"; accompany_type: "none" | "friend" | "guardian"; accompany_count: number; has_photo: boolean; trophy_state: "pending" | "given"; trophy_on: string; items: { item_id: number; name: string; state: "issued" | "returned" | "lost" }[]; photo?: string; wa_state: string; registered_via: string; create_date: string;
  email?: string; note?: string; token?: string; hat_issued_on?: string; hat_returned_on?: string; checkin_by?: string; approved_by?: string;
  expected?: { name: string; category: string } | null;
  messages?: { id: number; type: string; state: string; error: string; created: string; retries: number }[];
  already?: boolean;
};
export type Block = { id: number; name: string; prefix: string; start_no: number; end_no: number; row_size: number; row_layout: string; row_names: string; sequence: number; sections: number[]; total: number; occupied: number; free: number };
export type Seat = { id: number; label: string; number: number; row: number; block_id: number; row_name?: string; blocked: boolean; reserved_for?: string; occupant: { id: number; name: string; kind: string } | null };
