import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, SupportCaseStatus, SupportSubmitterType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { generateSupportCaseCode } from './support-code.util';

const MAX_CODE_RETRIES = 5;

/**
 * "Soporte con la aplicación" — general/technical support cases (§ "Soporte técnico" in Admin).
 * A case belongs to exactly one submitterUserId (the individual who opened it) — kept deliberately
 * simple: even a BUSINESS-context case is only visible to the staff member who filed it, not every
 * OWNER/MANAGER of that business. That's the "own cases, never anyone else's" rule from the spec,
 * satisfied without needing a BusinessOwnershipGuard-style route (these live under /me/support/*,
 * not /business/:businessId/*, so there's no route param to guard on).
 */
@Injectable()
export class SupportCasesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Re-checks the claimed submitterType actually matches the caller's real context — a request
   * body claiming BUSINESS/RIDER is never trusted on its own. */
  private async assertSubmitterContext(userId: string, submitterType: SupportSubmitterType, businessId?: string) {
    if (submitterType === SupportSubmitterType.BUSINESS) {
      if (!businessId) throw new BadRequestException('businessId is required when submitterType is BUSINESS');
      const membership = await this.prisma.businessUser.findUnique({
        where: { businessId_userId: { businessId, userId } },
      });
      if (!membership) throw new ForbiddenException('You do not have access to this business');
    } else if (submitterType === SupportSubmitterType.RIDER) {
      const rider = await this.prisma.rider.findUnique({ where: { userId } });
      if (!rider) throw new ForbiddenException('You are not a registered rider');
    }
  }

  async create(
    userId: string,
    data: { submitterType: SupportSubmitterType; businessId?: string; subject: string; description: string; evidenceUrl?: string },
  ) {
    await this.assertSubmitterContext(userId, data.submitterType, data.businessId);

    for (let attempt = 0; attempt < MAX_CODE_RETRIES; attempt++) {
      try {
        return await this.prisma.supportCase.create({
          data: {
            code: generateSupportCaseCode(),
            submitterType: data.submitterType,
            submitterUserId: userId,
            businessId: data.submitterType === SupportSubmitterType.BUSINESS ? data.businessId : undefined,
            subject: data.subject,
            description: data.description,
            evidenceUrl: data.evidenceUrl,
          },
        });
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') continue;
        throw err;
      }
    }
    throw new BadRequestException('Could not generate a unique support case code, try again');
  }

  listMine(userId: string) {
    return this.prisma.supportCase.findMany({
      where: { submitterUserId: userId },
      orderBy: { createdAt: 'desc' },
      include: { responses: { orderBy: { createdAt: 'asc' } } },
    });
  }

  async getMine(userId: string, id: string) {
    const supportCase = await this.prisma.supportCase.findUnique({
      where: { id },
      include: { responses: { orderBy: { createdAt: 'asc' } } },
    });
    if (!supportCase || supportCase.submitterUserId !== userId) throw new NotFoundException('Support case not found');
    return supportCase;
  }

  // ── Admin (§ "Soporte técnico") ──────────────────────────────────────────────────────────────

  listAll(status?: SupportCaseStatus) {
    return this.prisma.supportCase.findMany({
      where: status ? { status } : undefined,
      orderBy: { createdAt: 'desc' },
      include: {
        submitter: { select: { id: true, firstName: true, lastName: true, email: true } },
        business: { select: { id: true, tradeName: true } },
        responses: { orderBy: { createdAt: 'asc' }, include: { author: { select: { id: true, firstName: true, lastName: true } } } },
      },
    });
  }

  async getOneAdmin(id: string) {
    const supportCase = await this.prisma.supportCase.findUnique({
      where: { id },
      include: {
        submitter: { select: { id: true, firstName: true, lastName: true, email: true } },
        business: { select: { id: true, tradeName: true } },
        responses: { orderBy: { createdAt: 'asc' }, include: { author: { select: { id: true, firstName: true, lastName: true } } } },
      },
    });
    if (!supportCase) throw new NotFoundException('Support case not found');
    return supportCase;
  }

  async respond(id: string, adminUserId: string, data: { message: string; evidenceUrl?: string }) {
    const supportCase = await this.prisma.supportCase.findUnique({ where: { id } });
    if (!supportCase) throw new NotFoundException('Support case not found');
    const [response] = await this.prisma.$transaction([
      this.prisma.supportCaseResponse.create({
        data: { caseId: id, authorUserId: adminUserId, message: data.message, evidenceUrl: data.evidenceUrl },
      }),
      // A response implies the case is being worked — auto-advance RECEIVED -> IN_PROGRESS, but
      // never overwrite an already-CLOSED case just because someone replied on it.
      this.prisma.supportCase.updateMany({
        where: { id, status: SupportCaseStatus.RECEIVED },
        data: { status: SupportCaseStatus.IN_PROGRESS },
      }),
    ]);
    return response;
  }

  async setStatus(id: string, status: SupportCaseStatus) {
    const supportCase = await this.prisma.supportCase.findUnique({ where: { id } });
    if (!supportCase) throw new NotFoundException('Support case not found');
    return this.prisma.supportCase.update({
      where: { id },
      data: { status, closedAt: status === SupportCaseStatus.CLOSED ? new Date() : null },
    });
  }
}
