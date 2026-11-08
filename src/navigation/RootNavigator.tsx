import React, { useEffect, useState } from 'react';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { trackScreen } from '../lib/analytics';

const navRef = createNavigationContainerRef<any>();
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { View, ActivityIndicator, Text, TouchableOpacity, Linking } from 'react-native';
import { C, F } from '../theme';
import { Icon } from '../components/Icon';

import { useAuth } from '../hooks/useAuth';
import { supabase } from '../lib/supabase';
import { registerForPushNotifications } from '../lib/notifications';

import RoleSelectScreen from '../screens/auth/RoleSelectScreen';
import SignUpScreen from '../screens/auth/SignUpScreen';
import SignInScreen from '../screens/auth/SignInScreen';
import CreatorOnboardingScreen from '../screens/auth/CreatorOnboardingScreen';
import VerifyEmailScreen from '../screens/auth/VerifyEmailScreen';
import BusinessOnboardingScreen from '../screens/auth/BusinessOnboardingScreen';

import CreatorPendingScreen from '../screens/creator/CreatorPendingScreen';
import CreatorHomeScreen from '../screens/creator/CreatorHomeScreen';
import CircuitDetailScreen from '../screens/creator/CircuitDetailScreen';
import MyRedemptionsScreen from '../screens/creator/MyRedemptionsScreen';
import SubmitPostScreen from '../screens/creator/SubmitPostScreen';

import BusinessCircuitDetailScreen from '../screens/business/BusinessCircuitDetailScreen';
import CreateCircuitScreen from '../screens/business/CreateCircuitScreen';
import CircuitLiveScreen from '../screens/business/CircuitLiveScreen';
import PostIntroScreen from '../screens/business/PostIntroScreen';

import MyCircuitsScreen from '../screens/shared/MyCircuitsScreen';
import ProfileScreen from '../screens/shared/ProfileScreen';
import SettingsScreen from '../screens/shared/SettingsScreen';
import PlaceholderScreen from '../screens/shared/PlaceholderScreen';
import CreatorProfileScreen from '../screens/creator/CreatorProfileScreen';
import CreatorPublicProfileScreen from '../screens/creator/CreatorPublicProfileScreen';
import PostSubmittedScreen from '../screens/creator/PostSubmittedScreen';
import BusinessProfileScreen from '../screens/business/BusinessProfileScreen';
import BusinessPublicProfileScreen from '../screens/business/BusinessPublicProfileScreen';

import AdminDashboardScreen from '../screens/admin/AdminDashboardScreen';

const Stack = createStackNavigator();
const Tab = createBottomTabNavigator();
const ADMIN_EMAILS = ['hello@localcurrentapp.com'];

function AuthStack({ initialRoute }: { initialRoute?: string } = {}) {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }} initialRouteName={initialRoute}>
      <Stack.Screen name="RoleSelect" component={RoleSelectScreen} />
      <Stack.Screen name="SignUp" component={SignUpScreen} />
      <Stack.Screen name="SignIn" component={SignInScreen} />
      <Stack.Screen name="VerifyEmail" component={VerifyEmailScreen} />
      <Stack.Screen name="CreatorOnboarding" component={CreatorOnboardingScreen} />
      <Stack.Screen name="BusinessOnboarding" component={BusinessOnboardingScreen} />
    </Stack.Navigator>
  );
}

function CreatorPendingStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="CreatorPending" component={CreatorPendingScreen} />
    </Stack.Navigator>
  );
}

function BrowseStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="CreatorHome" component={CreatorHomeScreen} />
      <Stack.Screen name="CircuitDetail" component={CircuitDetailScreen} />
      <Stack.Screen name="SubmitPost" component={SubmitPostScreen} />
      <Stack.Screen name="PostSubmitted" component={PostSubmittedScreen} />
      <Stack.Screen name="BusinessPublicProfile" component={BusinessPublicProfileScreen} />
    </Stack.Navigator>
  );
}

function BusinessBrowseStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="CreatorHome" component={CreatorHomeScreen} />
      <Stack.Screen name="CircuitDetail" component={CircuitDetailScreen} />
    </Stack.Navigator>
  );
}

function MyCircuitsStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="MyCircuits" component={MyCircuitsScreen} />
      <Stack.Screen name="BusinessCircuitDetail" component={BusinessCircuitDetailScreen} />
      <Stack.Screen name="MyRedemptions" component={MyRedemptionsScreen} />
      <Stack.Screen name="SubmitPost" component={SubmitPostScreen} />
      <Stack.Screen name="PostSubmitted" component={PostSubmittedScreen} />
      <Stack.Screen name="CreatorHome" component={CreatorHomeScreen} />
      <Stack.Screen name="CircuitDetail" component={CircuitDetailScreen} />
      <Stack.Screen name="CreatorProfile" component={CreatorProfileScreen} />
      <Stack.Screen name="CreatorPublicProfile" component={CreatorPublicProfileScreen} />
    </Stack.Navigator>
  );
}

function CreatorMyClaimsStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="MyRedemptions" component={MyRedemptionsScreen} />
      <Stack.Screen name="SubmitPost" component={SubmitPostScreen} />
      <Stack.Screen name="PostSubmitted" component={PostSubmittedScreen} />
      <Stack.Screen name="CircuitDetail" component={CircuitDetailScreen} />
      <Stack.Screen name="BusinessPublicProfile" component={BusinessPublicProfileScreen} />
    </Stack.Navigator>
  );
}

function PostCircuitStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="PostIntro" component={PostIntroScreen} />
      <Stack.Screen name="CreateCircuit" component={CreateCircuitScreen} />
      <Stack.Screen name="CircuitLive" component={CircuitLiveScreen} />
    </Stack.Navigator>
  );
}

function ProfileStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Profile" component={ProfileScreen} />
    </Stack.Navigator>
  );
}

function BusinessProfileStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="BusinessProfile" component={BusinessProfileScreen} />
      <Stack.Screen name="BusinessCircuitDetail" component={BusinessCircuitDetailScreen} />
      <Stack.Screen name="CreatorPublicProfile" component={CreatorPublicProfileScreen} />
      <Stack.Screen name="Settings" component={SettingsScreen} />
      <Stack.Screen name="EditProfile" component={ProfileScreen} />
      <Stack.Screen name="PrivacyPolicy" component={PlaceholderScreen} initialParams={{ title: 'Privacy Policy' }} />
      <Stack.Screen name="TermsOfService" component={PlaceholderScreen} initialParams={{ title: 'Terms of Service' }} />
    </Stack.Navigator>
  );
}

function CreatorProfileStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="CreatorProfile" component={CreatorProfileScreen} />
      <Stack.Screen name="Settings" component={SettingsScreen} />
      <Stack.Screen name="EditProfile" component={ProfileScreen} />
      <Stack.Screen name="PrivacyPolicy" component={PlaceholderScreen} initialParams={{ title: 'Privacy Policy' }} />
      <Stack.Screen name="TermsOfService" component={PlaceholderScreen} initialParams={{ title: 'Terms of Service' }} />
    </Stack.Navigator>
  );
}

const TAB_BAR_STYLE = {
  backgroundColor: C.paper,
  borderTopColor: C.line,
  borderTopWidth: 1,
  paddingBottom: 4,
  height: 60,
};

function CreatorTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: C.accent,
        tabBarInactiveTintColor: C.muted2,
        tabBarStyle: TAB_BAR_STYLE,
        tabBarLabel: ({ color }) => {
          const labels: Record<string, string> = {
            BrowseTab: 'Browse',
            MyCircuitsTab: 'My Currents',
            ProfileTab: 'Profile',
          };
          return <Text style={{ color, fontSize: 10, fontFamily: F.bodyMedium }}>{labels[route.name]}</Text>;
        },
        tabBarIcon: ({ color }) => {
          const iconMap: Record<string, any> = {
            BrowseTab: 'search',
            MyCircuitsTab: 'clipboard',
            ProfileTab: 'person',
          };
          return <Icon name={iconMap[route.name]} size={22} color={color} />;
        },
      })}
    >
      <Tab.Screen name="BrowseTab" component={BrowseStack} />
      <Tab.Screen name="MyCircuitsTab" component={CreatorMyClaimsStack} />
      <Tab.Screen name="ProfileTab" component={CreatorProfileStack} />
    </Tab.Navigator>
  );
}

function BusinessTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: C.accent,
        tabBarInactiveTintColor: C.muted2,
        tabBarStyle: TAB_BAR_STYLE,
        tabBarLabel: ({ color }) => {
          const labels: Record<string, string> = {
            MyCircuitsTab: 'Browse',
            PostTab: 'Post',
            ProfileTab: 'Profile',
          };
          return <Text style={{ color, fontSize: 10, fontFamily: F.bodyMedium }}>{labels[route.name]}</Text>;
        },
        tabBarIcon: ({ color }) => {
          const iconMap: Record<string, any> = {
            MyCircuitsTab: 'search',
            PostTab: 'plus',
            ProfileTab: 'person',
          };
          return <Icon name={iconMap[route.name]} size={22} color={color} />;
        },
      })}
    >
      <Tab.Screen name="MyCircuitsTab" component={MyCircuitsStack} />
      <Tab.Screen
        name="PostTab"
        component={PostCircuitStack}
        listeners={({ navigation }) => ({
          // Always start a fresh post flow instead of reopening the last screen.
          tabPress: () => navigation.navigate('PostTab', { screen: 'PostIntro' }),
        })}
      />
      <Tab.Screen name="ProfileTab" component={BusinessProfileStack} />
    </Tab.Navigator>
  );
}

function AdminStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="AdminDashboard" component={AdminDashboardScreen} />
    </Stack.Navigator>
  );
}

/**
 * Deep links from emails and pushes:
 *   localcurrent://event/<id>   creator: the event page (claim, code, review)
 *   localcurrent://manage/<id>  business: the event dashboard (claims, posts, ratings)
 *   localcurrent://post         business: post a new event
 *   localcurrent://home         the home tab
 * Also accepts https://localcurrentapp.com/open?to=<path>.
 */
function parseDeepLink(url: string): { kind: string; id?: string } | null {
  try {
    let path = url.replace(/^[a-z][\w.+-]*:\/\//i, '');
    const to = url.match(/[?&]to=([^&]+)/);
    if (/^https?:/.test(url)) { if (!to) return null; path = decodeURIComponent(to[1]); }
    const [kind, id] = path.replace(/^\/+/, '').split(/[/?#]/);
    return kind ? { kind, id } : null;
  } catch { return null; }
}

async function openDeepLink(link: { kind: string; id?: string }, role: string) {
  if (!navRef.isReady()) return false;
  if ((link.kind === 'event' || link.kind === 'manage') && link.id) {
    const { data: circuit } = await supabase.from('circuits').select('*, business:businesses(*)').eq('id', link.id).maybeSingle();
    if (!circuit) return true;
    if (role === 'business') navRef.navigate('MyCircuitsTab', { screen: 'BusinessCircuitDetail', params: { circuit } });
    else navRef.navigate('BrowseTab', { screen: 'CircuitDetail', params: { circuit } });
    return true;
  }
  if (link.kind === 'post' && role === 'business') { navRef.navigate('PostTab', { screen: 'PostIntro' }); return true; }
  if (link.kind === 'home') { navRef.navigate(role === 'business' ? 'MyCircuitsTab' : 'BrowseTab'); return true; }
  return true;
}

export default function RootNavigator() {
  const lastScreen = React.useRef<string | null>(null);
  const pendingLink = React.useRef<{ kind: string; id?: string } | null>(null);
  const [navReady, setNavReady] = useState(false);
  const { session, profile, loading } = useAuth();
  const [creatorStatus, setCreatorStatus] = useState<string | null>(null);
  const [creatorLoading, setCreatorLoading] = useState(false);
  // Business accounts are created at step 1 of onboarding; keep them there
  // until their businesses row exists.
  const [hasBusiness, setHasBusiness] = useState<boolean | null>(null);

  useEffect(() => {
    // Permission is asked on the last welcome page after sign-up (after we
    // explain why). Here we only refresh the token if it was already granted.
    if (session && profile) {
      registerForPushNotifications(false);
    }
  }, [session, profile?.role]);

  useEffect(() => {
    if (session && profile?.role === 'creator') {
      setCreatorLoading(true);
      supabase
        .from('creators')
        .select('status')
        .eq('profile_id', session.user.id)
        .single()
        .then(({ data }) => {
          setCreatorStatus(data?.status ?? null);
          setCreatorLoading(false);
        });
    } else {
      setCreatorStatus(null);
      setCreatorLoading(false);
    }
  }, [session, profile]);

  useEffect(() => {
    if (session && profile?.role === 'business') {
      supabase
        .from('businesses')
        .select('id')
        .eq('profile_id', session.user.id)
        .maybeSingle()
        .then(({ data }) => setHasBusiness(!!data));
    } else {
      setHasBusiness(null);
    }
  }, [session, profile]);

  const businessLoading = !!session && profile?.role === 'business' && hasBusiness === null;

  // Remember incoming links; open them once signed in and the tabs are showing.
  useEffect(() => {
    const take = (url: string | null) => { const l = url && parseDeepLink(url); if (l) pendingLink.current = l; flushRef.current(); };
    Linking.getInitialURL().then(take);
    const sub = Linking.addEventListener('url', ({ url }) => take(url));
    return () => sub.remove();
  }, []);
  const tabsShowing = !!session && !!profile && (profile.role === 'business' ? !!hasBusiness : creatorStatus === 'approved' || creatorStatus === 'pending');
  function flush() {
    const l = pendingLink.current;
    if (!l || !tabsShowing || !profile) return;
    pendingLink.current = null;
    setTimeout(() => openDeepLink(l, profile.role), 300);
  }
  const flushRef = React.useRef(flush);
  flushRef.current = flush;
  useEffect(() => { if (navReady) flush(); }, [navReady, tabsShowing]);

  if (loading || creatorLoading || businessLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color={C.accent} />
      </View>
    );
  }

  function renderStack() {
    if (!session || !profile) return <AuthStack />;
    if (ADMIN_EMAILS.includes(profile.email)) return <AdminStack />;
    if (profile.role === 'business') {
      return hasBusiness ? <BusinessTabs /> : <AuthStack initialRoute="BusinessOnboarding" />;
    }
    if (creatorStatus === 'approved' || creatorStatus === 'pending') return <CreatorTabs />;
    if (creatorStatus === 'rejected') return <CreatorPendingStack />;
    return <AuthStack />;
  }

  return (
    <NavigationContainer
      ref={navRef}
      onReady={() => { setNavReady(true); const r = navRef.getCurrentRoute(); if (r) trackScreen(r.name); }}
      onStateChange={() => {
        // One "screen" event per page view, so PostHog shows where people go and drop off.
        const r = navRef.getCurrentRoute();
        if (r && r.name !== lastScreen.current) { lastScreen.current = r.name; trackScreen(r.name); }
      }}
    >
      {renderStack()}
    </NavigationContainer>
  );
}
