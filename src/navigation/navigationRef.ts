import { createNavigationContainerRef } from '@react-navigation/native';

export type RootParamList = {
  Home: { openConfirm?: string; openApprove?: string; openActive?: boolean } | undefined;
  Request: undefined;
  Profile: undefined;
};

export const navigationRef = createNavigationContainerRef<RootParamList>();

export function navigate(name: keyof RootParamList, params?: any) {
  if (navigationRef.isReady()) {
    navigationRef.navigate(name, params);
  }
}
