export class GoogleAuthDto {
  idToken: string;
}

export class AuthResponseDto {
  accessToken: string;
  user: {
    id: string;
    email: string;
    name: string;
    photoUrl: string;
    subscriptionTier: string;
  };
}
