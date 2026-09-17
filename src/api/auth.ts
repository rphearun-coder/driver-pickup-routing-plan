import axios from 'axios';
import { gqlRequest } from './graphql';
import { USER_SERVICE_URL } from '../config';
import type { AuthUser, UserProfile } from '../types';
import type { AuthenticatedUser, LoginPayload, LoginResponse as AppLoginResponse } from '../types/api';

const userHttp = axios.create({
  baseURL: USER_SERVICE_URL,
  headers: {
    'Content-Type': 'application/json',
    'x-platform': 'web',
    'x-udid': 'jalat-location-app',
  },
});

// App-level login (Home/Profile/Login pages, gated by the router's requiresAuth
// meta). Distinct from loginDriver() below, which is the DriverPanel's own
// embedded login for the live location-publishing feature.
export function login(payload: LoginPayload) {
  return userHttp
    .post<{ data?: { adminLogin: { token: string; user: AuthenticatedUser } }; errors?: Array<{ message: string }> }>(
      '',
      {
        query: `mutation AdminLogin($username: String!, $password: String!) {
          adminLogin(input: { username: $username, password: $password }) {
            token
            user {
              id
              username
              fullName
              userType
              status
            }
          }
        }`,
        variables: payload,
      },
    )
    .then((res) => {
      const result = res.data;
      if (result.errors?.length || !result.data?.adminLogin) {
        throw new Error(result.errors?.map((error) => error.message).join('; ') ?? 'Login failed');
      }

      return {
        accessToken: result.data.adminLogin.token,
        user: result.data.adminLogin.user,
      } satisfies AppLoginResponse;
    });
}

const LOGIN_MUTATION = `
  mutation Login($input: LoginInput!) {
    login(input: $input) { user { id username fullName } token }
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
