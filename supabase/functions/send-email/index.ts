// Edge Function: send-email
// All customer + admin emails (copy: docs/local-current-emails.html).
//
//  POST { type, id }  with x-cron-secret — from database triggers (pg_net):
//    creator_signup   creators.id     → 01 creator welcome + 14 admin
//    business_signup  businesses.id   → 06 business welcome + 14 admin
//    current_posted   circuits.id     → 07 "your event is live"
//    claim            redemptions.id  → 04 creator "you've got tickets" + 09 business "someone's coming"
//    post             posts.id        → 10 business "it's up"
//    problem          redemptions.id  → 15 admin "problem reported"
//  POST { type: 'hourly' } with x-cron-secret — 24h after a post:
//    04b creator "how was it?", 10b business "how did @x do?", 11 business 24-hour results
//  GET ?unsub=<profile id>&t=<sig> — turns off alert/recap emails.
//
// email_log keys make every email go out at most once.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  layout, hi, p, fine, b, esc, link, btn, ol, ul, card, codeBox, stats,
  recipient, once, send, sendAdmin, prefsFooter, verifyUnsub, APP_URL, ADMIN_EMAIL, appLink,
} from '../_shared/email.ts';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const STAGES = [150_000, 100_000, 50_000, 25_000, 10_000, 5_000, 0];
const compact = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
  : n >= 1_000 ? `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}K` : String(n);
const at = (h?: string | null) => (h ? `@${String(h).replace(/^@/, '')}` : '');

async function creatorInfo(db: SupabaseClient, creatorId: string) {
  const { data: c } = await db.from('creators')
    .select('id, profile_id, tiktok_handle, instagram_handle, follower_range, main_platform, profile:profiles(full_name)')
    .eq('id', creatorId).single();
  if (!c) return null;
  const { data: conns } = await db.from('social_connections')
    .select('platform, follower_count').eq('profile_id', c.profile_id).eq('connection_type', 'oauth');
  const best = (conns ?? []).sort((a: any, z: any) => (z.follower_count ?? 0) - (a.follower_count ?? 0))[0];
  const handle = at(c.tiktok_handle || c.instagram_handle);
  return {
    ...c,
    name: (c as any).profile?.full_name || handle || 'A creator',
    handle: handle || (c as any).profile?.full_name || 'a creator',
    followers: best ? `${compact(best.follower_count ?? 0)} followers on ${best.platform === 'tiktok' ? 'TikTok' : 'Instagram'}` : (c.follower_range ? `${c.follower_range} followers` : ''),
  };
}

async function circuitInfo(db: SupabaseClient, circuitId: string) {
  const { data } = await db.from('circuits')
    .select('id, title, description, event_link, code_mode, promo_code, max_redemptions, min_followers, created_at, business:businesses(id, business_name, profile_id, instagram_handle, tiktok_handle)')
    .eq('id', circuitId).single();
  return data as any;
}

// ── Event emails ─────────────────────────────────────────────────────────────

async function creatorSignup(db: SupabaseClient, id: string) {
  const c = await creatorInfo(db, id);
  if (!c) return;
  if (await once(db, `01:${id}`)) {
    const r = await recipient(db, c.profile_id);
    if (r) {
      await send(r.email, "You're in! Here's how to get your first tickets", layout({
        tag: 'Chicago', preview: 'Free tickets to Chicago events. Claim, go, post.',
        body: hi(`Welcome, ${esc(r.first)}. You're in.`) +
          p('Chicago businesses give creators like you 2 free tickets to their events, one for you and one for a friend. All they ask for is an honest video. Here\'s how it works:') +
          ol([
            ['Claim.', 'When an event opens up to you, tap Claim tickets. You\'ll get a code for 2 free tickets.'],
            ['Grab your tickets.', 'Use the code on the business\'s ticket site, then tap "I got my tickets" in the app.'],
            ['Go.', 'Bring a friend and have fun.'],
            ['Post.', 'Within 48 hours, share an honest video on TikTok or Instagram, tag the business, and add #localcurrentapp.'],
          ]) +
          fine('One thing to know: bigger accounts see each event first, and every 24 hours it opens to the next group. Turn on notifications so you catch yours.') +
          btn('Browse events'),
      }));
    }
  }
  if (await once(db, `14c:${id}`)) {
    await sendAdmin(`New creator: ${c.name}`, [
      `<b>${esc(c.name)}</b> signed up as a creator.`,
      `Handle: ${esc(c.handle)}`, `Followers: ${esc(c.followers || 'not connected')}`,
    ]);
  }
}

async function businessSignup(db: SupabaseClient, id: string) {
  const { data: biz } = await db.from('businesses').select('id, profile_id, business_name, address').eq('id', id).single();
  if (!biz) return;
  if (await once(db, `06:${id}`)) {
    const r = await recipient(db, biz.profile_id);
    if (r) {
      await send(r.email, 'Welcome to Local Current', layout({
        tag: 'Chicago', preview: 'Your first event takes about 3 minutes to post.',
        body: hi(`Welcome, ${esc(r.first)}.`) +
          p('Glad you\'re here.') +
          p('Influencer marketing has gotten complicated and expensive. On top of running your business, you\'re expected to be an expert in finding creators, negotiating, and tracking results. After 7 years in the space, I built Local Current to make it seamless.') +
          p('Here\'s how it works:') +
          ol([
            ['Post an event.', 'Add the date, your ticket link, creator criteria, and a redemption code.'],
            ['Creators claim.', 'Verified Chicago creators grab your code and get their tickets.'],
            ['They post.', 'Each one shares an honest video on TikTok or Instagram within 48 hours.'],
            ['Track performance in the app, automatically.', 'See how many people saw and engaged with each video.'],
          ]) +
          p('You only pay in the tickets you give away. Ready?') +
          btn('Post your first event', appLink('post')) +
          p('Talk soon,<br>Kari, founder of Local Current'),
      }));
    }
  }
  if (await once(db, `14b:${id}`)) {
    await sendAdmin(`New business: ${biz.business_name}`, [
      `<b>${esc(biz.business_name)}</b> signed up as a business.`, `Address: ${esc(biz.address ?? '—')}`,
    ]);
  }
}

async function currentPosted(db: SupabaseClient, id: string) {
  const ci = await circuitInfo(db, id);
  if (!ci || !(await once(db, `07:${id}`))) return;
  const r = await recipient(db, ci.business.profile_id);
  if (!r) return;
  const min = ci.min_followers ?? 0;
  const top = STAGES.filter((v) => v >= min)[0] ?? min;
  const code = ci.code_mode === 'list' ? 'unique code per creator' : ci.promo_code ? `${ci.promo_code} for everyone` : '';
  const spots = ci.max_redemptions ?? 0;
  await send(r.email, `${ci.title} is live!`, layout({
    tag: 'Live', preview: "Here's what happens next.",
    body: hi(`${esc(ci.title)} is live.`) +
      p(`Hi ${esc(r.first)}, here's what to expect:`) +
      ul([
        top > min ? `<strong>Today:</strong> creators with the biggest followings (${compact(top)}+) see it first.` : '<strong>Today:</strong> every eligible creator can see it.',
        ...(top > min ? [`<strong>Every 24 hours:</strong> it opens to the next group, down to your minimum (${compact(min)}).`] : []),
        '<strong>As creators claim:</strong> we\'ll email you who\'s coming.',
        '<strong>After the event:</strong> creators post within 48 hours, and we\'ll send you their videos and results.',
      ]) +
      card('Your event', esc(ci.title), code ? `Code: ${esc(code)}` : '', `${spots} creators × 2 tickets`) +
      fine('No need to keep refreshing the app. We\'ll keep you posted.') +
      btn('View your event', appLink(`manage/${ci.id}`)),
  }));
}

async function claim(db: SupabaseClient, id: string) {
  const { data: red } = await db.from('redemptions').select('id, creator_id, circuit_id, code').eq('id', id).single();
  if (!red) return;
  const [ci, c] = await Promise.all([circuitInfo(db, red.circuit_id), creatorInfo(db, red.creator_id)]);
  if (!ci || !c) return;
  const biz = ci.business;
  const bizName = biz.business_name ?? 'the business';

  if (await once(db, `04:${id}`)) {
    const r = await recipient(db, c.profile_id);
    const code = red.code ?? ci.promo_code;
    const handles = [at(biz.instagram_handle), at(biz.tiktok_handle)].filter(Boolean);
    const uniq = [...new Set(handles)];
    if (r) {
      await send(r.email, `You're going to ${ci.title}! Your code is inside`, layout({
        tag: "You're in", preview: code ? `Your code: ${code}. Here's what to do next.` : "Here's what to do next.",
        body: hi(`You've got tickets, ${esc(r.first)}.`) +
          p(`You're going to ${b(ci.title)}.${code ? " Here's your code:" : ''}`) +
          (code ? codeBox(code) : '') +
          p(`Use it at checkout on ${ci.event_link ? link(ci.event_link, `${esc(bizName)}'s ticket site`) : `${esc(bizName)}'s ticket site`}, then tap "I got my tickets" in the app so we know you're set.`) +
          p('<strong>A few things for your post</strong>') +
          ul([
            'Post within 48 hours of the event.',
            uniq.length ? `Tag ${esc(uniq.join(' / '))}.` : `Tag ${esc(bizName)}.`,
            '15 to 60 seconds is the sweet spot: the place, the vibe, your honest take.',
            "Add <strong>#LocalCurrentApp</strong> to your caption. This is how we know your post went live. If you don't include it, we and the business won't see it!",
          ]) +
          fine("Can't make it after all? Release your tickets in the app so another creator can go. No-shows and missing posts can get an account paused or banned (a real local business saved tickets for you, and no-shows have a real impact on them!), so please do give us a heads up.") +
          btn('View in the app', appLink(`event/${ci.id}`)),
      }));
    }
  }

  if (await once(db, `09:${id}`)) {
    const r = await recipient(db, biz.profile_id, true);
    if (r) {
      const { count } = await db.from('redemptions').select('id', { count: 'exact', head: true })
        .eq('circuit_id', ci.id).in('status', ['approved', 'claimed', 'checked_in', 'completed']);
      const spots = ci.max_redemptions ?? 0;
      await send(r.email, `${c.handle} is coming to ${ci.title}`, layout({
        tag: 'New claim', preview: `${count ?? 1} of ${spots} spots claimed.`,
        body: hi(`Someone's coming, ${esc(r.first)}.`) +
          p(`${b(c.name)} just claimed tickets to ${b(ci.title)}.`) +
          card('Creator', esc(c.handle), esc(c.followers), `${count ?? 1} of ${spots} claimed`) +
          btn("See who's coming", appLink(`manage/${ci.id}`)),
        footer: await prefsFooter("You're getting this because you have a live event.", biz.profile_id),
      }));
    }
  }
}

async function postAdded(db: SupabaseClient, id: string) {
  const { data: post } = await db.from('posts').select('id, redemption_id, video_url').eq('id', id).single();
  if (!post) return;
  const { data: red } = await db.from('redemptions').select('creator_id, circuit_id').eq('id', post.redemption_id).single();
  if (!red || !(await once(db, `10:${post.redemption_id}`))) return; // one email per creator, not per post
  const [ci, c] = await Promise.all([circuitInfo(db, red.circuit_id), creatorInfo(db, red.creator_id)]);
  if (!ci || !c) return;
  const r = await recipient(db, ci.business.profile_id, true);
  if (!r) return;
  await send(r.email, `${c.handle} posted about ${ci.title}`, layout({
    tag: 'New post', preview: 'Go watch it and show some love.',
    body: hi(`It's up, ${esc(r.first)}.`) +
      p(`${b(c.handle)} just posted about ${b(ci.title)}. Go check it out!`) +
      btn('Watch the video', appLink(`manage/${ci.id}`)) +
      fine("A like or a share from you helps it reach more people. We'll send you the numbers in 24 hours."),
    footer: await prefsFooter("You're getting this because a creator posted about your event.", ci.business.profile_id),
  }));
}

async function problem(db: SupabaseClient, id: string) {
  const { data: red } = await db.from('redemptions')
    .select('id, creator_id, circuit_id, problem_report_type, problem_report_details, problem_reported_at').eq('id', id).single();
  if (!red?.problem_reported_at || !(await once(db, `15:${id}:${red.problem_reported_at}`))) return;
  const [ci, c] = await Promise.all([circuitInfo(db, red.circuit_id), creatorInfo(db, red.creator_id)]);
  await sendAdmin(`Problem reported: ${ci?.title ?? 'an event'}`, [
    `<b>${esc(c?.name ?? 'A creator')}</b> (${esc(c?.handle ?? '')}) reported a problem.`,
    `Event: ${esc(ci?.title ?? '—')} · ${esc(ci?.business?.business_name ?? '')}`,
    `Type: ${esc(red.problem_report_type ?? '—')}`,
    `Details: ${esc(red.problem_report_details ?? '—')}`,
  ]);
}

async function report(db: SupabaseClient, id: string) {
  if (!(await once(db, `15r:${id}`))) return;
  const { data: rep } = await db.from('problem_reports').select('*').eq('id', id).single();
  if (!rep) return;
  const [{ data: prof }, { data: u }, ci, c] = await Promise.all([
    db.from('profiles').select('full_name, role').eq('id', rep.reporter_id).single(),
    db.auth.admin.getUserById(rep.reporter_id),
    rep.circuit_id ? circuitInfo(db, rep.circuit_id) : Promise.resolve(null),
    rep.creator_id ? creatorInfo(db, rep.creator_id) : Promise.resolve(null),
  ]);
  await sendAdmin(`Problem reported${ci ? `: ${ci.title}` : ''}`, [
    `<b>${esc(prof?.full_name || 'Someone')}</b> (${esc(prof?.role ?? 'user')}, ${esc(u?.user?.email ?? 'no email')}) reported a problem.`,
    ci ? `Event: ${esc(ci.title)} · ${esc(ci.business?.business_name ?? '')}` : 'General report (from Settings)',
    c ? `About creator: ${esc(c.name)} (${esc(c.handle)})` : '',
    `Type: ${esc(String(rep.report_type).replace(/_/g, ' '))}`,
    `Details: ${esc(rep.details ?? '—')}`,
    'Reply to them directly at the email above.',
  ].filter(Boolean));
}

// ── Hourly: 24 hours after a post ────────────────────────────────────────────

async function hourly(db: SupabaseClient) {
  const now = Date.now();
  const from = new Date(now - 7 * 86_400_000).toISOString();
  const to = new Date(now - 86_400_000).toISOString();
  const { data: posts } = await db.from('posts')
    .select('id, redemption_id, platform, video_url, views, likes, comments, shares, saves, submitted_at')
    .gte('submitted_at', from).lte('submitted_at', to);
  let sent = 0;
  const seenRedemptions = new Set<string>();

  for (const post of posts ?? []) {
    const { data: red } = await db.from('redemptions')
      .select('id, creator_id, circuit_id, creator_rating, business_rating').eq('id', post.redemption_id).single();
    if (!red) continue;
    const [ci, c] = await Promise.all([circuitInfo(db, red.circuit_id), creatorInfo(db, red.creator_id)]);
    if (!ci || !c) continue;
    const bizName = ci.business.business_name ?? 'the business';

    // 11 · 24-hour results (per post, once stats have synced)
    if (post.views != null && await once(db, `11:${post.id}`)) {
      const r = await recipient(db, ci.business.profile_id, true);
      if (r) {
        const eng = (post.likes ?? 0) + (post.comments ?? 0) + (post.shares ?? 0) + (post.platform === 'instagram' ? post.saves ?? 0 : 0);
        await send(r.email, `${c.handle}'s video: ${compact(post.views)} views in 24 hours`, layout({
          tag: 'Day 1', preview: `Early numbers for ${ci.title}.`,
          body: hi(`First 24 hours, ${esc(r.first)}.`) +
            p(`Here's how ${esc(c.handle)}'s video for ${b(ci.title)} is doing so far:`) +
            stats([[compact(post.views), 'views'], [compact(eng), 'engagements']]) +
            btn('View the post', appLink(`manage/${ci.id}`)),
          footer: await prefsFooter("You're getting this because a creator posted about your event.", ci.business.profile_id),
        }));
        sent++;
      }
    }

    if (seenRedemptions.has(red.id)) continue;
    seenRedemptions.add(red.id);

    // 04b · creator reviews the business
    if (red.creator_rating == null && await once(db, `04b:${red.id}`)) {
      const r = await recipient(db, c.profile_id, true);
      if (r) {
        await send(r.email, `How was ${ci.title}?`, layout({
          tag: 'Review', preview: `Leave ${bizName} a quick review. It takes 10 seconds.`,
          body: hi(`How was it, ${esc(r.first)}?`) +
            p(`Thanks for posting about ${b(ci.title)}! Your video is live, and ${esc(bizName)} can see it.`) +
            p(`How was your experience with ${esc(bizName)}? Please rate them in the app.`) +
            p(`Your review shows up <strong>anonymously</strong> on ${esc(bizName)}'s profile and helps other creators decide who to work with.`) +
            btn(`Review ${bizName}`, appLink(`event/${ci.id}`)) +
            fine(`This review is just about ${esc(bizName)} and the event, not the Local Current app. Got app feedback? Reply to this email instead.`),
          footer: await prefsFooter("You're getting this because you posted about an event.", c.profile_id),
        }));
        sent++;
      }
    }

    // 10b · business rates the creator
    if (red.business_rating == null && await once(db, `10b:${red.id}`)) {
      const r = await recipient(db, ci.business.profile_id, true);
      if (r) {
        await send(r.email, `How did ${c.handle} do?`, layout({
          tag: 'Review', preview: `How was working with them on ${ci.title}? It takes 10 seconds.`,
          body: hi(`How did ${esc(c.handle)} do?`) +
            p(`${esc(c.handle)} posted about ${b(ci.title)}. How was your experience working with them? Please rate them in the app.`) +
            p('Your rating shows up on their profile, and helps other businesses know who to work with.') +
            btn(`Rate ${c.handle}`, appLink(`manage/${ci.id}`)) +
            fine(`This rating is just about ${esc(c.handle)} and working with them, not the Local Current app. Got app feedback? Reply to this email instead.`),
          footer: await prefsFooter("You're getting this because a creator posted about your event.", ci.business.profile_id),
        }));
        sent++;
      }
    }
  }
  return sent;
}

async function sendTest(to: string) {
  await send(to, "[Test] You're in! Here's how to get your first tickets", layout({
    tag: 'Chicago', preview: 'Free tickets to Chicago events. Claim, go, post.',
    body: hi("Welcome, Kari. You're in.") +
      p("Chicago businesses give creators like you 2 free tickets to their events, one for you and one for a friend. All they ask for is an honest video. Here's how it works:") +
      ol([
        ['Claim.', "When an event opens up to you, tap Claim tickets. You'll get a code for 2 free tickets."],
        ['Grab your tickets.', 'Use the code on the business\'s ticket site, then tap "I got my tickets" in the app.'],
        ['Go.', 'Bring a friend and have fun.'],
        ['Post.', 'Within 48 hours, share an honest video on TikTok or Instagram, tag the business, and add #localcurrentapp.'],
      ]) + btn('Browse events'),
  }));
  await send(to, "[Test] You're going to Jazz Night! Your code is inside", layout({
    tag: "You're in", preview: 'Your code: LOCAL2. Here\'s what to do next.',
    body: hi("You've got tickets, Kari.") + p(`You're going to ${b('Jazz Night')}. Here's your code:`) + codeBox('LOCAL2') +
      p(`Use it at checkout on ${link(APP_URL, "Coffee Shop's ticket site")}, then tap "I got my tickets" in the app so we know you're set.`) +
      stats([['12.4K', 'views'], ['863', 'engagements']]) + btn('View in the app'),
    footer: await prefsFooter("You're getting this because this is a test.", '00000000-0000-0000-0000-000000000000'),
  }));
}

// ── Entry ────────────────────────────────────────────────────────────────────

serve(async (req) => {
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const url = new URL(req.url);

  // Email buttons: bounce straight into the app (Supabase serves HTML as plain text, so redirect).
  if (url.searchParams.get('open')) {
    return new Response(null, { status: 302, headers: { Location: 'localcurrent://' } });
  }

  const unsub = url.searchParams.get('unsub');
  if (unsub) {
    const ok = await verifyUnsub(unsub, url.searchParams.get('t') ?? '');
    if (ok) await db.from('profiles').update({ email_opt_out: true }).eq('id', unsub);
    return new Response(
      ok ? "You're unsubscribed from Local Current alert and recap emails.\n\nYou'll still get emails about your account and tickets you claim."
         : "This link didn't work. Reply to any Local Current email and we'll sort it out.",
      { headers: { 'Content-Type': 'text/plain; charset=utf-8' } },
    );
  }

  const secret = Deno.env.get('CRON_SECRET');
  if (!secret || req.headers.get('x-cron-secret') !== secret) return json({ error: 'Forbidden' }, 403);

  try {
    const { type, id } = await req.json();
    switch (type) {
      case 'creator_signup': await creatorSignup(db, id); break;
      case 'business_signup': await businessSignup(db, id); break;
      case 'current_posted': await currentPosted(db, id); break;
      case 'claim': await claim(db, id); break;
      case 'post': await postAdded(db, id); break;
      case 'problem': await problem(db, id); break;
      case 'report': await report(db, id); break;
      case 'hourly': return json({ sent: await hourly(db) });
      case 'test': {
        // Preview: sends the welcome emails to the admin inbox with sample data.
        const r = { email: ADMIN_EMAIL, first: 'Kari' };
        const orig = recipient;
        await sendTest(r.email);
        return json({ ok: true, to: r.email, orig: !!orig });
      }
      default: return json({ error: `Unknown type ${type}` }, 400);
    }
    return json({ ok: true });
  } catch (err: any) {
    console.error(err);
    return json({ error: err.message }, 500);
  }
});
