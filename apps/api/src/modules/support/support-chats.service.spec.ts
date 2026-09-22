import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { SupportChatRelatedType, SupportChatSenderType, SupportChatStatus, SupportSubmitterType } from '@prisma/client';
import { SupportChatsService } from './support-chats.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('SupportChatsService', () => {
  let service: SupportChatsService;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      businessUser: { findUnique: jest.fn() },
      rider: { findUnique: jest.fn() },
      order: { findUnique: jest.fn() },
      booking: { findUnique: jest.fn() },
      delivery: { findUnique: jest.fn() },
      supportChat: { create: jest.fn(), findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
      supportChatMessage: { create: jest.fn(), findMany: jest.fn() },
    };
    service = new SupportChatsService(prisma as unknown as PrismaService);
  });

  describe('create — ownership checks', () => {
    it('lets a CUSTOMER open a chat about their own order', async () => {
      prisma.order.findUnique.mockResolvedValue({ id: 'o1', userId: 'u1' });
      prisma.supportChat.create.mockResolvedValue({ id: 'chat1' });
      await service.create('u1', { submitterType: SupportSubmitterType.CUSTOMER, relatedType: SupportChatRelatedType.ORDER, relatedId: 'o1' });
      expect(prisma.supportChat.create).toHaveBeenCalled();
    });

    it('rejects a CUSTOMER trying to open a chat about someone else\'s order', async () => {
      prisma.order.findUnique.mockResolvedValue({ id: 'o1', userId: 'someone-else' });
      await expect(
        service.create('u1', { submitterType: SupportSubmitterType.CUSTOMER, relatedType: SupportChatRelatedType.ORDER, relatedId: 'o1' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects a RIDER trying to reference an ORDER instead of a DELIVERY', async () => {
      prisma.rider.findUnique.mockResolvedValue({ id: 'rider1', userId: 'u1' });
      await expect(
        service.create('u1', { submitterType: SupportSubmitterType.RIDER, relatedType: SupportChatRelatedType.ORDER, relatedId: 'o1' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('lets a RIDER open a chat about their own assigned delivery', async () => {
      prisma.rider.findUnique.mockResolvedValue({ id: 'rider1', userId: 'u1' });
      prisma.delivery.findUnique.mockResolvedValue({ id: 'd1', riderId: 'rider1' });
      prisma.supportChat.create.mockResolvedValue({ id: 'chat1' });
      await service.create('u1', { submitterType: SupportSubmitterType.RIDER, relatedType: SupportChatRelatedType.DELIVERY, relatedId: 'd1' });
      expect(prisma.supportChat.create).toHaveBeenCalled();
    });

    it('rejects a RIDER referencing a delivery assigned to a different rider', async () => {
      prisma.rider.findUnique.mockResolvedValue({ id: 'rider1', userId: 'u1' });
      prisma.delivery.findUnique.mockResolvedValue({ id: 'd1', riderId: 'someone-else' });
      await expect(
        service.create('u1', { submitterType: SupportSubmitterType.RIDER, relatedType: SupportChatRelatedType.DELIVERY, relatedId: 'd1' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects a BUSINESS chat when the caller is not a member of that business', async () => {
      prisma.businessUser.findUnique.mockResolvedValue(null);
      await expect(
        service.create('u1', {
          submitterType: SupportSubmitterType.BUSINESS,
          businessId: 'b1',
          relatedType: SupportChatRelatedType.ORDER,
          relatedId: 'o1',
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('sendMine', () => {
    it('tags the message with the chat\'s own submitterType', async () => {
      prisma.supportChat.findUnique.mockResolvedValue({ id: 'chat1', submitterUserId: 'u1', status: SupportChatStatus.OPEN, submitterType: SupportSubmitterType.CUSTOMER });
      prisma.supportChatMessage.create.mockResolvedValue({ id: 'm1' });
      await service.sendMine('u1', 'chat1', 'Hola, necesito ayuda', undefined);
      expect(prisma.supportChatMessage.create).toHaveBeenCalledWith({
        data: { chatId: 'chat1', senderType: SupportChatSenderType.CUSTOMER, senderUserId: 'u1', text: 'Hola, necesito ayuda', imageUrl: undefined },
      });
    });

    it('accepts an image-only message with no text', async () => {
      prisma.supportChat.findUnique.mockResolvedValue({ id: 'chat1', submitterUserId: 'u1', status: SupportChatStatus.OPEN, submitterType: SupportSubmitterType.CUSTOMER });
      prisma.supportChatMessage.create.mockResolvedValue({ id: 'm1' });
      await service.sendMine('u1', 'chat1', undefined, 'https://example.com/photo.jpg');
      expect(prisma.supportChatMessage.create).toHaveBeenCalledWith({
        data: { chatId: 'chat1', senderType: SupportChatSenderType.CUSTOMER, senderUserId: 'u1', text: undefined, imageUrl: 'https://example.com/photo.jpg' },
      });
    });

    it('rejects a message with neither text nor an image', async () => {
      await expect(service.sendMine('u1', 'chat1', undefined, undefined)).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.supportChat.findUnique).not.toHaveBeenCalled();
    });

    it('refuses to send into a closed chat', async () => {
      prisma.supportChat.findUnique.mockResolvedValue({ id: 'chat1', submitterUserId: 'u1', status: SupportChatStatus.CLOSED, submitterType: SupportSubmitterType.CUSTOMER });
      await expect(service.sendMine('u1', 'chat1', 'hola', undefined)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('never leaks another user\'s chat', async () => {
      prisma.supportChat.findUnique.mockResolvedValue({ id: 'chat1', submitterUserId: 'other-user', status: SupportChatStatus.OPEN });
      await expect(service.sendMine('u1', 'chat1', 'hola', undefined)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('sendAdmin', () => {
    it('tags the message as ADMIN and accepts an image', async () => {
      prisma.supportChat.findUnique.mockResolvedValue({ id: 'chat1', status: SupportChatStatus.OPEN });
      prisma.supportChatMessage.create.mockResolvedValue({ id: 'm1' });
      await service.sendAdmin('admin1', 'chat1', 'Ya lo resolvimos', 'https://example.com/proof.jpg');
      expect(prisma.supportChatMessage.create).toHaveBeenCalledWith({
        data: { chatId: 'chat1', senderType: SupportChatSenderType.ADMIN, senderUserId: 'admin1', text: 'Ya lo resolvimos', imageUrl: 'https://example.com/proof.jpg' },
      });
    });

    it('rejects a message with neither text nor an image', async () => {
      await expect(service.sendAdmin('admin1', 'chat1', undefined, undefined)).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.supportChat.findUnique).not.toHaveBeenCalled();
    });

    it('refuses to send into a closed chat', async () => {
      prisma.supportChat.findUnique.mockResolvedValue({ id: 'chat1', status: SupportChatStatus.CLOSED });
      await expect(service.sendAdmin('admin1', 'chat1', 'hola', undefined)).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('closeAndRate', () => {
    it('stamps status, closedAt and the rating', async () => {
      prisma.supportChat.findUnique.mockResolvedValue({ id: 'chat1', submitterUserId: 'u1', status: SupportChatStatus.OPEN });
      prisma.supportChat.update.mockResolvedValue({ id: 'chat1' });
      await service.closeAndRate('u1', 'chat1', 5, 'Excelente atención');
      const data = prisma.supportChat.update.mock.calls[0][0].data;
      expect(data.status).toBe(SupportChatStatus.CLOSED);
      expect(data.ratingScore).toBe(5);
      expect(data.ratingComment).toBe('Excelente atención');
      expect(data.closedAt).toBeInstanceOf(Date);
    });

    it('refuses to close/rate an already-closed chat twice', async () => {
      prisma.supportChat.findUnique.mockResolvedValue({ id: 'chat1', submitterUserId: 'u1', status: SupportChatStatus.CLOSED });
      await expect(service.closeAndRate('u1', 'chat1', 4)).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('listMessages', () => {
    it('filters by createdAt when a cursor is given', async () => {
      prisma.supportChatMessage.findMany.mockResolvedValue([]);
      await service.listMessages('chat1', '2026-01-01T00:00:00.000Z');
      expect(prisma.supportChatMessage.findMany.mock.calls[0][0].where).toEqual({
        chatId: 'chat1',
        createdAt: { gt: new Date('2026-01-01T00:00:00.000Z') },
      });
    });
  });

  describe('openAdmin', () => {
    it('assigns the first admin that opens an unassigned chat', async () => {
      prisma.supportChat.findUnique.mockResolvedValue({ id: 'chat1', assignedAdminId: null });
      prisma.supportChat.update.mockResolvedValue({ id: 'chat1', assignedAdminId: 'admin-1' });
      await service.openAdmin('admin-1', 'chat1');
      expect(prisma.supportChat.update).toHaveBeenCalledWith({ where: { id: 'chat1' }, data: { assignedAdminId: 'admin-1' } });
    });

    it('does not reassign a chat another admin already picked up', async () => {
      prisma.supportChat.findUnique.mockResolvedValue({ id: 'chat1', assignedAdminId: 'admin-1' });
      await service.openAdmin('admin-2', 'chat1');
      expect(prisma.supportChat.update).not.toHaveBeenCalled();
    });
  });
});
