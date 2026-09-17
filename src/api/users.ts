import axios from 'axios';
import { postGraphQL } from '../lib/graphql-request';
import type { AuthenticatedUser } from '../types/api';

const userHttp = axios.create({
  baseURL: import.meta.env.VITE_USER_SERVICE_URL ?? 'http://localhost:8081/v1',
  headers: {
    'Content-Type': 'application/json',
    'x-platform': 'web',
    'x-udid': 'jalat-client',
  },
});

export function getMyProfile() {
  return postGraphQL<{ getProfile: AuthenticatedUser }>(
    userHttp,
    'query { getProfile { id username fullName phoneNumber avatar userType status } }',
    {},
    'User service',
  ).then(({ getProfile }) => ({ ...getProfile, roles: [getProfile.userType] }));
}

export interface BankAccountData {
  accountNumber: string;
  accountType: string;
  accountName: string;
  bankCode?: string;
}

export interface DriverProfileData {
  zoneId?: string;
  nationalIdentity?: string;
  vehicleIdentity?: string;
  pickupCapacity?: number;
  deliveryCapacity?: number;
  secondaryPhoneNumbers?: string[];
  pickupShift?: string;
  deliveryShift?: string;
  homeAddress?: string;
}

export interface FullProfile extends AuthenticatedUser {
  bankAccounts: BankAccountData[];
  driverProfile: DriverProfileData | null;
}

const FULL_PROFILE_FIELDS = `
  id username fullName phoneNumber avatar userType status
  bankAccounts { accountNumber accountType accountName bankCode }
  driverProfile {
    zoneId nationalIdentity vehicleIdentity pickupCapacity deliveryCapacity
    secondaryPhoneNumbers pickupShift deliveryShift homeAddress
  }
`;

// updateProfile (see updateMyProfile below) requires bankAccounts/driverProfile to
// already be populated even for a simple name/phone edit — this fetches them so the
// edit form can resubmit them unchanged instead of wiping them out.
export function getMyFullProfile() {
  return postGraphQL<{ getProfile: FullProfile }>(
    userHttp,
    `query { getProfile { ${FULL_PROFILE_FIELDS} } }`,
    {},
    'User service',
  ).then(({ getProfile }) => ({ ...getProfile, roles: [getProfile.userType] }));
}

export interface UpdateMyProfileInput {
  fullName?: string;
  phoneNumber: string;
  avatar?: string;
  bankAccounts: BankAccountData[];
  driverProfile?: DriverProfileData | null;
}

// Only id is selected back — Jalat-User-Service's updateProfile response currently
// comes back with userType null for a DRIVER (a backend bug: updateDriverType's
// return value doesn't repopulate it), which crashes GraphQL's non-nullable-field
// check if userType is requested here, even though the write itself succeeds.
// The caller re-fetches the full profile via getMyProfile()/getMyFullProfile()
// afterward, so nothing beyond a bare success signal is needed from this response.
export function updateMyProfile(input: UpdateMyProfileInput) {
  return postGraphQL<{ updateProfile: { id: string } }>(
    userHttp,
    `mutation UpdateProfile($input: UpdateProfileInput!) {
      updateProfile(input: $input) { id }
    }`,
    { input },
    'User service',
  ).then((data) => data.updateProfile);
}

export function changeMyPassword(currentPassword: string, newPassword: string) {
  return postGraphQL<{ changePassword: boolean }>(
    userHttp,
    `mutation ChangePassword($input: ChangePasswordInput!) {
      changePassword(input: $input)
    }`,
    { input: { currentPassword, newPassword } },
    'User service',
  ).then((data) => data.changePassword);
}
