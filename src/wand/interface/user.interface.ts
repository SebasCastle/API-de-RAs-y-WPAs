export interface UserResponse {
  agentId: string;
  userName: string;
  authorizedWandUser: boolean;

  mnemonicList: unknown[];
  locMnemonicList: string[];

  frequentFlyerCodeList: unknown[];
}
