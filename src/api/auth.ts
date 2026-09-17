import { gqlRequest } from './graphql';
import { USER_SERVICE_URL } from '../config';
import type { AuthUser, UserProfile } from '../types';

const LOGIN_MUTATION = `
  mutation Login($input: LoginInput!) {
    login(input: $input) { user { id username fullName phoneNumber userType status } token }
  }
`;

const GET_PROFILE_QUERY = `
  query GetProfile {
    getProfile {
      id
      fullName
      avatar
      phoneNumber
      roleId
      gender
      bankAccounts { id userId accountType accountNumber accountName }
      driverProfile { zoneId nationalIdentity vehicleIdentity }
    }
  }
`;

interface LoginResponse {
  login: { user: AuthUser; token: string };
}

export async function loginDriver(
  phoneNumber: string,
  password: string
): Promise<{ user: AuthUser; token: string }> {
  const data = await gqlRequest<LoginResponse>(USER_SERVICE_URL, LOGIN_MUTATION, {
    input: { phoneNumber, password, firebaseToken: 'web-client', userType: ['DRIVER'] },
  });
  return data.login;
}

export async function getProfile(token: string): Promise<UserProfile> {
  const data = await gqlRequest<{ getProfile: UserProfile }>(
    USER_SERVICE_URL,
    GET_PROFILE_QUERY,
    undefined,
    token
  );
  return data.getProfile;
}
