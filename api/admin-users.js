import { createClient } from '@supabase/supabase-js';

function serverClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error('Supabase server configuration is incomplete.');
  }

  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
}

async function requireAdmin(req, sb) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();

  if (!token) {
    const err = new Error('Unauthorized.');
    err.status = 401;
    throw err;
  }

  const {
    data: { user },
    error
  } = await sb.auth.getUser(token);

  if (error || !user) {
    const err = new Error('Unauthorized.');
    err.status = 401;
    throw err;
  }

  const { data, error: adminError } = await sb
    .from('admin_users')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (adminError) {
    throw adminError;
  }

  if (!data) {
    const err = new Error('Administrator access required.');
    err.status = 403;
    throw err;
  }

  return user;
}

async function getAllAuthUsers(sb) {
  const users = [];
  let page = 1;

  while (page <= 20) {
    const { data, error } = await sb.auth.admin.listUsers({
      page,
      perPage: 1000
    });

    if (error) {
      throw error;
    }

    const pageUsers = data?.users || [];
    users.push(...pageUsers);

    if (pageUsers.length < 1000) {
      break;
    }

    page += 1;
  }

  return users;
}

async function getAdminList(sb) {
  const { data: rows, error } = await sb
    .from('admin_users')
    .select('user_id,created_at')
    .order('created_at', { ascending: true });

  if (error) {
    throw error;
  }

  const users = await getAllAuthUsers(sb);
  const authMap = new Map(users.map(user => [user.id, user]));

  const ids = (rows || []).map(row => row.user_id);

  let profiles = [];

  if (ids.length > 0) {
    const { data, error: profileError } = await sb
      .from('profiles')
      .select('id,full_name,email')
      .in('id', ids);

    if (!profileError) {
      profiles = data || [];
    }
  }

  const profileMap = new Map(
    profiles.map(profile => [profile.id, profile])
  );

  return (rows || []).map(row => {
    const profile = profileMap.get(row.user_id);
    const authUser = authMap.get(row.user_id);

    return {
      user_id: row.user_id,
      email: profile?.email || authUser?.email || '',
      full_name: profile?.full_name || '',
      created_at: row.created_at
    };
  });
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');

  if (!['GET', 'POST', 'DELETE'].includes(req.method)) {
    return res.status(405).json({
      error: 'Method not allowed.'
    });
  }

  try {
    const sb = serverClient();

    const currentAdmin = await requireAdmin(req, sb);

    // ============================================
    // GET — LIST CURRENT ADMINISTRATORS
    // ============================================
    if (req.method === 'GET') {
      const admins = await getAdminList(sb);

      return res.status(200).json({
        ok: true,
        admins
      });
    }

    let body = {};

    try {
      body =
        typeof req.body === 'string'
          ? JSON.parse(req.body || '{}')
          : req.body || {};
    } catch {
      return res.status(400).json({
        error: 'Invalid request body.'
      });
    }

    // ============================================
    // POST — ADD ADMINISTRATOR BY EMAIL
    // ============================================
    if (req.method === 'POST') {
      const email = String(body.email || '')
        .trim()
        .toLowerCase();

      if (!email) {
        return res.status(400).json({
          error: 'Email is required.'
        });
      }

      const users = await getAllAuthUsers(sb);

      const user = users.find(
        item =>
          String(item.email || '')
            .trim()
            .toLowerCase() === email
      );

      if (!user) {
        return res.status(404).json({
          error:
            'No Nexus account exists with that email. Have them create a Nexus account first.'
        });
      }

      const { data: existing, error: existingError } = await sb
        .from('admin_users')
        .select('user_id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (existingError) {
        throw existingError;
      }

      if (existing) {
        return res.status(200).json({
          ok: true,
          already_admin: true,
          user_id: user.id,
          email: user.email,
          message: 'This account is already a Nexus administrator.'
        });
      }

      const { error: insertError } = await sb
        .from('admin_users')
        .insert({
          user_id: user.id
        });

      if (insertError) {
        throw insertError;
      }

      return res.status(200).json({
        ok: true,
        user_id: user.id,
        email: user.email,
        message: 'Administrator added successfully.'
      });
    }

    // ============================================
    // DELETE — REMOVE ADMINISTRATOR
    // ============================================

    const userId = String(body.user_id || '').trim();

    if (!userId) {
      return res.status(400).json({
        error: 'User ID is required.'
      });
    }

    // Prevent the currently logged-in admin from
    // accidentally removing their own access.
    if (userId === currentAdmin.id) {
      return res.status(409).json({
        error:
          'You cannot remove your own administrator access while signed in.'
      });
    }

    const {
      count,
      error: countError
    } = await sb
      .from('admin_users')
      .select('*', {
        count: 'exact',
        head: true
      });

    if (countError) {
      throw countError;
    }

    if ((count || 0) <= 1) {
      return res.status(409).json({
        error:
          'You cannot remove the last Nexus administrator.'
      });
    }

    const { data: targetAdmin, error: targetError } = await sb
      .from('admin_users')
      .select('user_id')
      .eq('user_id', userId)
      .maybeSingle();

    if (targetError) {
      throw targetError;
    }

    if (!targetAdmin) {
      return res.status(404).json({
        error: 'Administrator was not found.'
      });
    }

    const { error: deleteError } = await sb
      .from('admin_users')
      .delete()
      .eq('user_id', userId);

    if (deleteError) {
      throw deleteError;
    }

    return res.status(200).json({
      ok: true,
      message: 'Administrator access removed.'
    });

  } catch (error) {
    console.error('Nexus admin-users API error:', error);

    return res.status(error?.status || 500).json({
      error:
        error?.message ||
        'An unexpected server error occurred.'
    });
  }
}
