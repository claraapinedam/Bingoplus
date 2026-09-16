import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreatePetDto } from './dto/create-pet.dto';
import { UpdatePetDto } from './dto/update-pet.dto';

@Injectable()
export class PetsService {
  constructor(private readonly prisma: PrismaService) {}

  listSpecies() {
    return this.prisma.petSpecies.findMany({ orderBy: { name: 'asc' } });
  }

  list(ownerId: string) {
    return this.prisma.pet.findMany({
      where: { ownerId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      include: { species: true },
    });
  }

  async get(ownerId: string, petId: string) {
    const pet = await this.assertOwnsPet(ownerId, petId);
    return this.prisma.pet.findUniqueOrThrow({ where: { id: pet.id }, include: { species: true } });
  }

  async create(ownerId: string, dto: CreatePetDto) {
    const { speciesSlug, ...rest } = dto;
    const speciesId = await this.resolveSpeciesId(speciesSlug);
    return this.prisma.pet.create({
      data: {
        ...rest,
        speciesId,
        birthDate: dto.birthDate ? new Date(dto.birthDate) : undefined,
        ownerId,
      },
      include: { species: true },
    });
  }

  async update(ownerId: string, petId: string, dto: UpdatePetDto) {
    await this.assertOwnsPet(ownerId, petId);
    const { speciesSlug, ...rest } = dto;
    const speciesId = speciesSlug ? await this.resolveSpeciesId(speciesSlug) : undefined;
    return this.prisma.pet.update({
      where: { id: petId },
      data: { ...rest, speciesId, birthDate: dto.birthDate ? new Date(dto.birthDate) : undefined },
      include: { species: true },
    });
  }

  async remove(ownerId: string, petId: string) {
    await this.assertOwnsPet(ownerId, petId);
    await this.prisma.pet.update({ where: { id: petId }, data: { deletedAt: new Date() } });
  }

  private async resolveSpeciesId(slug: string): Promise<string> {
    const species = await this.prisma.petSpecies.findUnique({ where: { slug } });
    if (!species) throw new BadRequestException(`Unknown pet species "${slug}"`);
    return species.id;
  }

  private async assertOwnsPet(ownerId: string, petId: string) {
    const pet = await this.prisma.pet.findUnique({ where: { id: petId } });
    if (!pet || pet.deletedAt) throw new NotFoundException('Pet not found');
    if (pet.ownerId !== ownerId) throw new ForbiddenException('Not your pet');
    return pet;
  }
}
