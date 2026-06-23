import { withAuth } from '@/lib/auth-middleware';
import { toLocalMobile, toAuthEmail, PHONE_FORMAT_HINT } from '@/lib/phone';
import { NextResponse } from 'next/server';
import logger from '@/lib/logger';

/**
 * PATCH /api/admin/users/[id]
 * Admin only — update a user. Any subset of:
 *   { full_name, email, phone, role, reports_to, status, password }
 * Phone changes also update the synthetic auth login email; password resets the
 * auth password. reports_to may be null to clear it.
 */
export const PATCH = withAuth(['admin'], async (request, { supabaseAdmin, params }) => {
  try {
    const { id: userId } = await params;
    const body = await request.json();
    const { status, role, reports_to, full_name, email, phone, password } = body;

    if (!userId) {
      return NextResponse.json({ error: 'Missing user ID' }, { status: 400 });
    }

    const profileUpdate = { updated_at: new Date().toISOString() };
    if (status !== undefined) profileUpdate.status = status;
    if (role !== undefined) profileUpdate.role = role;
    if (reports_to !== undefined) profileUpdate.reports_to = reports_to || null;
    if (full_name !== undefined) profileUpdate.full_name = String(full_name).trim();
    if (email !== undefined) profileUpdate.email = email && String(email).trim() ? String(email).trim() : null;

    // Phone change: keep profiles.phone and the Supabase Auth login email in sync.
    if (phone !== undefined) {
      const localPhone = toLocalMobile(phone);
      const authEmail = toAuthEmail(phone);
      if (!localPhone || !authEmail) {
        return NextResponse.json({ error: `Invalid phone number. ${PHONE_FORMAT_HINT}` }, { status: 400 });
      }
      const { error: authErr } = await supabaseAdmin.auth.admin.updateUserById(userId, { email: authEmail });
      if (authErr) {
        return NextResponse.json({ error: authErr.message || 'Failed to update login phone' }, { status: 400 });
      }
      profileUpdate.phone = localPhone;
    }

    // Optional password reset.
    if (password !== undefined && String(password).length > 0) {
      if (String(password).length < 6) {
        return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 });
      }
      const { error: pwErr } = await supabaseAdmin.auth.admin.updateUserById(userId, { password });
      if (pwErr) {
        return NextResponse.json({ error: pwErr.message || 'Failed to reset password' }, { status: 400 });
      }
    }

    // Nothing but updated_at? Then no profile field was supplied.
    if (Object.keys(profileUpdate).length === 1 && password === undefined) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    const { data: updatedProfile, error } = await supabaseAdmin
      .from('profiles')
      .update(profileUpdate)
      .eq('id', userId)
      .select()
      .single();

    if (error) {
      const dup = error.code === '23505';
      return NextResponse.json(
        { error: dup ? 'That phone or email is already in use.' : 'Failed to update user profile' },
        { status: dup ? 409 : 500 }
      );
    }
    if (!updatedProfile) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    logger.info('Admin updated user', { userId, fields: Object.keys(profileUpdate).filter((k) => k !== 'updated_at') });
    return NextResponse.json(updatedProfile, { status: 200 });
  } catch (error) {
    logger.error('Update user error:', { message: error?.message, stack: error?.stack });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});

/**
 * DELETE /api/admin/users/[id]
 * Admin only — delete a user from BOTH profiles and Supabase Auth (deleting the
 * auth user cascades the profile row). Blocked if the user owns sales (rep_id is
 * ON DELETE RESTRICT) — deactivate instead — and an admin cannot delete themself.
 */
export const DELETE = withAuth(['admin'], async (request, { user, supabaseAdmin, params }) => {
  try {
    const { id: userId } = await params;
    if (!userId) {
      return NextResponse.json({ error: 'Missing user ID' }, { status: 400 });
    }
    if (userId === user.id) {
      return NextResponse.json({ error: 'You cannot delete your own account.' }, { status: 400 });
    }

    // A user who owns sales can't be hard-deleted (FK RESTRICT). Guide to deactivate.
    const { count } = await supabaseAdmin
      .from('dialog_tv_sales')
      .select('id', { count: 'exact', head: true })
      .eq('rep_id', userId);
    if (count && count > 0) {
      return NextResponse.json(
        { error: `This user owns ${count} sale(s) and cannot be deleted. Set their status to Inactive instead.` },
        { status: 409 }
      );
    }

    // Deleting the auth user cascades to profiles (profiles.id → auth.users ON DELETE CASCADE).
    const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (error) {
      logger.error('Admin delete user: auth delete failed', { userId, reason: error.message });
      return NextResponse.json({ error: error.message || 'Failed to delete user' }, { status: 500 });
    }
    // Safety net in case the cascade didn't remove the profile.
    await supabaseAdmin.from('profiles').delete().eq('id', userId);

    logger.info('Admin deleted user', { userId, by: user.id });
    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    logger.error('Delete user error:', { message: error?.message, stack: error?.stack });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});
