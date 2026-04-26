CREATE TABLE "sessions" (
	"sid" varchar PRIMARY KEY NOT NULL,
	"sess" jsonb NOT NULL,
	"expire" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar,
	"username" varchar,
	"first_name" varchar,
	"last_name" varchar,
	"profile_image_url" varchar,
	"password_hash" varchar,
	"role" text DEFAULT 'employee' NOT NULL,
	"can_view_finances" boolean DEFAULT false NOT NULL,
	"google_access_token" text,
	"google_refresh_token" text,
	"google_token_expiry" timestamp with time zone,
	"google_email" varchar,
	"email_signature" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "contacts" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"phone" text,
	"organization" text,
	"type" text NOT NULL,
	"notes" text,
	"email2" text,
	"last_outreach_at" timestamp with time zone,
	"follow_up_at" timestamp with time zone,
	"outreach_window_months" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_contacts" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_id" serial NOT NULL,
	"contact_id" serial NOT NULL,
	"role" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_debriefs" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_id" integer NOT NULL,
	"time_in" timestamp with time zone,
	"time_out" timestamp with time zone,
	"day2_time_in" timestamp with time zone,
	"day2_time_out" timestamp with time zone,
	"grey_involved" boolean,
	"staff_present" text,
	"crowd_size" integer,
	"booth_placement" text,
	"sound_setup_notes" text,
	"what_worked" text,
	"what_didnt_work" text,
	"lead_quality" text,
	"would_repeat" boolean,
	"improvements" text,
	"leads_collected" integer,
	"trial_signups" integer,
	"event_vibe" text,
	"staff_notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_debriefs_event_id_unique" UNIQUE("event_id")
);
--> statement-breakpoint
CREATE TABLE "event_guest_list" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_id" integer NOT NULL,
	"band_member_id" integer,
	"student_name" text NOT NULL,
	"band_name" text,
	"token" text NOT NULL,
	"contact_email" text,
	"contact_name" text,
	"guest_one_name" text,
	"guest_two_name" text,
	"submitted" boolean DEFAULT false,
	"submitted_at" timestamp with time zone,
	"student_checked_in" boolean DEFAULT false,
	"guest_one_checked_in" boolean DEFAULT false,
	"guest_two_checked_in" boolean DEFAULT false,
	"event_day" integer DEFAULT 1,
	"is_manual" boolean DEFAULT false,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_guest_list_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "event_ticket_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_id" integer NOT NULL,
	"form_type" text NOT NULL,
	"contact_first_name" text NOT NULL,
	"contact_last_name" text NOT NULL,
	"contact_email" text NOT NULL,
	"ticket_count" integer,
	"ticket_type" text,
	"student_first_name" text,
	"student_last_name" text,
	"instrument" text,
	"recital_song" text,
	"teacher" text,
	"special_considerations" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"admin_notes" text,
	"charged" boolean DEFAULT false NOT NULL,
	"charged_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"week_reminder_sent" boolean DEFAULT false NOT NULL,
	"day_reminder_sent" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"type" text NOT NULL,
	"status" text DEFAULT 'planning' NOT NULL,
	"description" text,
	"location" text,
	"start_date" timestamp with time zone,
	"end_date" timestamp with time zone,
	"google_calendar_event_id" text,
	"calendar_tag" text,
	"is_two_day" boolean DEFAULT false,
	"day1_end_time" text,
	"day2_start_time" text,
	"is_paid" boolean DEFAULT false,
	"cost" numeric(10, 2),
	"revenue" numeric(10, 2),
	"external_ticket_sales" numeric(10, 2),
	"notes" text,
	"signup_token" text,
	"signup_deadline" timestamp with time zone,
	"image_url" text,
	"flyer_url" text,
	"tickets_url" text,
	"cta_label" text DEFAULT 'TICKETS',
	"ticket_form_type" text DEFAULT 'none',
	"ticket_price" numeric(10, 2),
	"day1_price" numeric(10, 2),
	"day2_price" numeric(10, 2),
	"ticket_cutoff_date" timestamp,
	"is_sold_out" boolean DEFAULT false,
	"has_band_lineup" boolean DEFAULT false,
	"has_staff_schedule" boolean DEFAULT false,
	"has_call_sheet" boolean DEFAULT false,
	"has_packing_list" boolean DEFAULT false,
	"allow_guest_list" boolean DEFAULT false,
	"is_lead_generating" boolean DEFAULT false,
	"has_debrief" boolean DEFAULT false,
	"debrief_nudge_sent" boolean DEFAULT false NOT NULL,
	"guest_list_policy" text DEFAULT 'students_only',
	"poc_name" text,
	"poc_email" text,
	"poc_phone" text,
	"primary_staff_id" varchar,
	"revenue_share_percent" integer DEFAULT 100,
	"per_ticket_venue_fee" numeric(10, 2),
	"lineup_pre_buffer_minutes" integer DEFAULT 0,
	"open_mic_series_id" integer,
	"open_mic_month" varchar(20),
	"open_mic_save_the_date_sent" boolean DEFAULT false NOT NULL,
	"open_mic_performer_list_sent" boolean DEFAULT false NOT NULL,
	"open_mic_skipped" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "events_signup_token_unique" UNIQUE("signup_token")
);
--> statement-breakpoint
CREATE TABLE "employee_hours" (
	"id" serial PRIMARY KEY NOT NULL,
	"employee_id" integer NOT NULL,
	"event_id" integer,
	"work_date" date NOT NULL,
	"hours" numeric(5, 2) NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employees" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"phone" text,
	"role" text DEFAULT 'staff' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"hourly_rate" numeric(10, 2),
	"user_id" text,
	"notes" text,
	"is_band_leader" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_employees" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_id" serial NOT NULL,
	"employee_id" serial NOT NULL,
	"role" text,
	"pay" numeric(10, 2),
	"notes" text,
	"minutes_before" integer,
	"minutes_after" integer,
	"google_calendar_event_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_signups" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_id" serial NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"phone" text,
	"role" text,
	"notes" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"week_reminder_sent" boolean DEFAULT false NOT NULL,
	"day_reminder_sent" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"category" text,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outreach" (
	"id" serial PRIMARY KEY NOT NULL,
	"contact_id" integer NOT NULL,
	"event_id" integer,
	"user_id" text,
	"method" text NOT NULL,
	"direction" text DEFAULT 'outbound',
	"subject" text,
	"body" text,
	"from_email" text,
	"to_email" text,
	"gmail_thread_id" text,
	"gmail_message_id" text,
	"notes" text,
	"outreach_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contact_assignments" (
	"id" serial PRIMARY KEY NOT NULL,
	"contact_id" integer NOT NULL,
	"user_id" text NOT NULL,
	"assigned_by" text,
	"auto_assigned" text DEFAULT 'false',
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uniq_contact_user" UNIQUE("contact_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "comm_schedule_rules" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_type" text NOT NULL,
	"event_tag_group" text,
	"event_tag" text,
	"comm_type" text NOT NULL,
	"message_name" text,
	"timing_days" integer NOT NULL,
	"channel" text,
	"notes" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "comm_tasks" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_id" integer NOT NULL,
	"rule_id" integer,
	"comm_type" text NOT NULL,
	"message_name" text,
	"channel" text,
	"due_date" timestamp with time zone,
	"google_calendar_event_id" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"notes" text,
	"assigned_to_employee_id" integer,
	"completed_by_employee_id" integer,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "band_contacts" (
	"id" serial PRIMARY KEY NOT NULL,
	"member_id" integer NOT NULL,
	"band_id" integer NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"phone" text,
	"relationship" text,
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "band_members" (
	"id" serial PRIMARY KEY NOT NULL,
	"band_id" integer NOT NULL,
	"name" text NOT NULL,
	"role" text,
	"instruments" text[],
	"is_band_leader" boolean DEFAULT false NOT NULL,
	"email" text,
	"phone" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bands" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"genre" text,
	"members" integer,
	"contact_name" text,
	"contact_email" text,
	"contact_phone" text,
	"notes" text,
	"website" text,
	"instagram" text,
	"leader_employee_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_band_invites" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_id" integer NOT NULL,
	"lineup_slot_id" integer NOT NULL,
	"band_id" integer,
	"member_id" integer,
	"contact_id" integer,
	"contact_name" text,
	"contact_email" text NOT NULL,
	"token" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attendance_status" text DEFAULT 'invited' NOT NULL,
	"staff_note" text,
	"conflict_note" text,
	"sent_at" timestamp with time zone,
	"responded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_band_invites_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "event_lineup" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_id" integer NOT NULL,
	"band_id" integer,
	"other_group_id" integer,
	"position" integer DEFAULT 0 NOT NULL,
	"label" text,
	"start_time" text,
	"duration_minutes" integer,
	"buffer_minutes" integer DEFAULT 15,
	"is_overlapping" boolean DEFAULT false NOT NULL,
	"confirmed" boolean DEFAULT false NOT NULL,
	"type" text DEFAULT 'act' NOT NULL,
	"group_name" text,
	"notes" text,
	"event_day" integer DEFAULT 1 NOT NULL,
	"staff_note" text,
	"invite_status" text DEFAULT 'not_sent' NOT NULL,
	"confirmation_sent" boolean DEFAULT false NOT NULL,
	"reminder_sent" boolean DEFAULT false NOT NULL,
	"leader_attending" boolean DEFAULT false NOT NULL,
	"leader_staff_slot_id" integer,
	"locked_in_start_time" text,
	"schedule_conflict" boolean DEFAULT false NOT NULL,
	"conflict_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "other_groups" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"contact_name" text,
	"contact_email" text,
	"contact_phone" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_packing" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_id" integer NOT NULL,
	"template_id" integer,
	"name" text NOT NULL,
	"category" text DEFAULT 'General' NOT NULL,
	"is_packed" boolean DEFAULT false NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "packing_preset_groups" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "packing_preset_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"group_id" integer NOT NULL,
	"name" text NOT NULL,
	"category" text DEFAULT 'General' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "packing_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"category" text DEFAULT 'General' NOT NULL,
	"applies_to_event_type" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_types" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"default_has_band_lineup" boolean DEFAULT false NOT NULL,
	"default_has_staff_schedule" boolean DEFAULT false NOT NULL,
	"default_has_call_sheet" boolean DEFAULT false NOT NULL,
	"default_has_packing_list" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_types_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "event_staff_slots" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_id" integer NOT NULL,
	"role_type_id" integer,
	"assigned_employee_id" integer,
	"start_time" timestamp with time zone,
	"end_time" timestamp with time zone,
	"notes" text,
	"confirmed" boolean DEFAULT false NOT NULL,
	"confirmation_token" text,
	"week_reminder_sent" boolean DEFAULT false NOT NULL,
	"day_reminder_sent" boolean DEFAULT false NOT NULL,
	"google_calendar_event_id" text,
	"event_day" integer DEFAULT 1 NOT NULL,
	"is_auto_created" boolean DEFAULT false NOT NULL,
	"bonus_pay" numeric(10, 2),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_staff_slots_confirmation_token_unique" UNIQUE("confirmation_token")
);
--> statement-breakpoint
CREATE TABLE "event_staff_tasks" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_id" integer NOT NULL,
	"staff_slot_id" integer,
	"task_text" text NOT NULL,
	"is_done" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "staff_role_types" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"color" text DEFAULT '#7250ef',
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "open_mic_mailing_list" (
	"id" serial PRIMARY KEY NOT NULL,
	"series_id" integer NOT NULL,
	"series_name" varchar(255),
	"name" varchar(255) NOT NULL,
	"email" varchar(255) NOT NULL,
	"source" varchar(50) DEFAULT 'signup' NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "open_mic_series" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"location" varchar(255) DEFAULT 'CVP Towson' NOT NULL,
	"address" text,
	"event_time" varchar(50) DEFAULT '6:00 PM' NOT NULL,
	"slug" varchar(100) NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"recurrence_type" varchar(50) DEFAULT 'first_friday' NOT NULL,
	"save_the_date_template" text,
	"performer_reminder_template" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "open_mic_series_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "open_mic_signups" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"email" varchar(255) NOT NULL,
	"instrument" varchar(255) NOT NULL,
	"artist_website" text,
	"music_link" text,
	"event_month" varchar(20),
	"series_id" integer,
	"event_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "event_contacts" ADD CONSTRAINT "event_contacts_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_contacts" ADD CONSTRAINT "event_contacts_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_debriefs" ADD CONSTRAINT "event_debriefs_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_guest_list" ADD CONSTRAINT "event_guest_list_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_ticket_requests" ADD CONSTRAINT "event_ticket_requests_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_primary_staff_id_users_id_fk" FOREIGN KEY ("primary_staff_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_hours" ADD CONSTRAINT "employee_hours_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_hours" ADD CONSTRAINT "employee_hours_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_employees" ADD CONSTRAINT "event_employees_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_employees" ADD CONSTRAINT "event_employees_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_signups" ADD CONSTRAINT "event_signups_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outreach" ADD CONSTRAINT "outreach_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outreach" ADD CONSTRAINT "outreach_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outreach" ADD CONSTRAINT "outreach_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_assignments" ADD CONSTRAINT "contact_assignments_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_assignments" ADD CONSTRAINT "contact_assignments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_assignments" ADD CONSTRAINT "contact_assignments_assigned_by_users_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comm_tasks" ADD CONSTRAINT "comm_tasks_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comm_tasks" ADD CONSTRAINT "comm_tasks_rule_id_comm_schedule_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."comm_schedule_rules"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comm_tasks" ADD CONSTRAINT "comm_tasks_assigned_to_employee_id_employees_id_fk" FOREIGN KEY ("assigned_to_employee_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comm_tasks" ADD CONSTRAINT "comm_tasks_completed_by_employee_id_employees_id_fk" FOREIGN KEY ("completed_by_employee_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "band_contacts" ADD CONSTRAINT "band_contacts_member_id_band_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."band_members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "band_contacts" ADD CONSTRAINT "band_contacts_band_id_bands_id_fk" FOREIGN KEY ("band_id") REFERENCES "public"."bands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "band_members" ADD CONSTRAINT "band_members_band_id_bands_id_fk" FOREIGN KEY ("band_id") REFERENCES "public"."bands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bands" ADD CONSTRAINT "bands_leader_employee_id_employees_id_fk" FOREIGN KEY ("leader_employee_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_band_invites" ADD CONSTRAINT "event_band_invites_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_band_invites" ADD CONSTRAINT "event_band_invites_lineup_slot_id_event_lineup_id_fk" FOREIGN KEY ("lineup_slot_id") REFERENCES "public"."event_lineup"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_band_invites" ADD CONSTRAINT "event_band_invites_band_id_bands_id_fk" FOREIGN KEY ("band_id") REFERENCES "public"."bands"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_band_invites" ADD CONSTRAINT "event_band_invites_member_id_band_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."band_members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_band_invites" ADD CONSTRAINT "event_band_invites_contact_id_band_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."band_contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_lineup" ADD CONSTRAINT "event_lineup_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_lineup" ADD CONSTRAINT "event_lineup_band_id_bands_id_fk" FOREIGN KEY ("band_id") REFERENCES "public"."bands"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_lineup" ADD CONSTRAINT "event_lineup_other_group_id_other_groups_id_fk" FOREIGN KEY ("other_group_id") REFERENCES "public"."other_groups"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_packing" ADD CONSTRAINT "event_packing_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_packing" ADD CONSTRAINT "event_packing_template_id_packing_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."packing_templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "packing_preset_items" ADD CONSTRAINT "packing_preset_items_group_id_packing_preset_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."packing_preset_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_staff_slots" ADD CONSTRAINT "event_staff_slots_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_staff_slots" ADD CONSTRAINT "event_staff_slots_role_type_id_staff_role_types_id_fk" FOREIGN KEY ("role_type_id") REFERENCES "public"."staff_role_types"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_staff_slots" ADD CONSTRAINT "event_staff_slots_assigned_employee_id_employees_id_fk" FOREIGN KEY ("assigned_employee_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_staff_tasks" ADD CONSTRAINT "event_staff_tasks_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_staff_tasks" ADD CONSTRAINT "event_staff_tasks_staff_slot_id_event_staff_slots_id_fk" FOREIGN KEY ("staff_slot_id") REFERENCES "public"."event_staff_slots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "IDX_session_expire" ON "sessions" USING btree ("expire");