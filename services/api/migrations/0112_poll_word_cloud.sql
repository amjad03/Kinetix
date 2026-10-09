-- Word-cloud questions: students type one to three words, the board shows them as a cloud.
ALTER TYPE "public"."poll_kind" ADD VALUE IF NOT EXISTS 'word';
