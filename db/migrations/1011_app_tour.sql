-- First-time app guidance.
--
-- Deliberately separate from `users.onboarding_completed_at`, which records whether
-- the profile setup form was submitted. A person can finish the tour without filling
-- in a bio, and can skip the tour without losing access to the app.
--
-- Existing accounts receive 'completed' so this release does not suddenly interrupt
-- them. New registrations explicitly insert NULL and are offered the welcome screen.
ALTER TABLE user_preferences ADD COLUMN app_tour_status TEXT DEFAULT 'completed';
