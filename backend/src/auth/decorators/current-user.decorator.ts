import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { UserRole } from '@prisma/client';

export interface CurrentUserData {
  id: string;
  email: string;
  tenantId: string;
  role: UserRole;
}

export const CurrentUser = createParamDecorator(
  (data: keyof CurrentUserData | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user as CurrentUserData;

    if (data) {
      return user[data];
    }

    return user;
  },
);
