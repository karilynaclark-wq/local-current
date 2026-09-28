import React, { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { View, ActivityIndicator, Text, TouchableOpacity } from 'react-native';
import { C, F } from '../theme';
import { Icon } from '../components/Icon';

import { useAuth } from '../hooks/useAuth';
import { supabase } from '../lib/supabase';
import { registerForPushNotifications } from '../lib/notifications';

import RoleSelectScreen from '../screens/auth/RoleSelectScreen';
import SignUpScreen from '../screens/auth/SignUpScreen';
import SignInScreen from '../screens/auth/SignInScreen';
import CreatorOnboardingScreen from '../screens/auth/CreatorOnboardingScreen';
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
const ADMIN_EMAILS = ['hello@join-circuit.com'];

function AuthStack({ initialRoute }: { initialRoute?: string } = {}) {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }} initialRouteName={initialRoute}>
      <Stack.Screen name="RoleSelect" component={RoleSelectScreen} />
      <Stack.Screen name="SignUp" component={SignUpScreen} />
      <Stack.Screen name="SignIn" component={SignInScreen} />
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
      <Tab.Screen name="PostTab" component={PostCircuitStack} />
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

export default function RootNavigator() {
  const { session, profile, loading } = useAuth();
  const [creatorStatus, setCreatorStatus] = useState<string | null>(null);
  const [creatorLoading, setCreatorLoading] = useState(false);
  // Business accounts are created at step 1 of onboarding; keep them there
  // until their businesses row exists.
  const [hasBusiness, setHasBusiness] = useState<boolean | null>(null);

  useEffect(() => {
    if (session) {
      registerForPushNotifications();
    }
  }, [session]);

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
    <NavigationContainer>
      {renderStack()}
    </NavigationContainer>
  );
}
