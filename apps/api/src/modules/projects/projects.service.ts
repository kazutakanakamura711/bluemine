import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { ProjectMemberRole } from '../../generated/prisma/enums.js';
import { CreateProjectDto } from './dto/create-project.dto.js';
import { ProjectsRepository } from './projects.repository.js';
import { UpdateProjectDto } from './dto/update-project.dto.js';

@Injectable()
export class ProjectsService {
  constructor(private readonly projectsRepository: ProjectsRepository) {}

  async findAll(userId: string) {
    return await this.projectsRepository.findAll(userId);
  }

  async findOne(id: string) {
    const project = await this.projectsRepository.findById(id);

    if (!project) {
      throw new NotFoundException('プロジェクトが見つかりません');
    }

    return project;
  }

  async findOneForMember(id: string, userId: string) {
    const project = await this.projectsRepository.findByIdForMember(id, userId);

    if (!project || project.projectMembers.length === 0) {
      throw new NotFoundException('プロジェクトが見つかりません');
    }

    const { projectMembers, ...projectData } = project;

    return {
      ...projectData,
      currentUserRole: projectMembers[0].role,
    };
  }

  async findProjectMembers(projectId: string, userId: string) {
    const projectMember = await this.projectsRepository.findProjectMember(
      projectId,
      userId,
    );

    // 参加情報がなければ404を返す。
    if (!projectMember) {
      throw new NotFoundException('プロジェクトが見つかりません');
    }
    // 一覧は、対象 Project の参加者であれば role を問わず閲覧できる。
    return await this.projectsRepository.findProjectMembers(projectId);
  }

  async create(dto: CreateProjectDto, ownerId: string) {
    try {
      return await this.projectsRepository.create({
        ownerId,
        name: dto.name.trim(),
        key: dto.key.toUpperCase(),
        description: dto.description,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('プロジェクトキーは既に使用されています');
      }

      throw error;
    }
  }

  async addProjectMember(
    projectId: string,
    email: string,
    role: Exclude<ProjectMemberRole, typeof ProjectMemberRole.owner>,
    userId: string,
  ) {
    const projectMember = await this.projectsRepository.findProjectMember(
      projectId,
      userId,
    );

    // 参加情報がなければ404を返す。
    if (!projectMember) {
      throw new NotFoundException('プロジェクトが見つかりません');
    }

    // role が owner 以外なら403を返す。
    if (projectMember.role !== ProjectMemberRole.owner) {
      throw new ForbiddenException(
        'プロジェクトに参加者を追加する権限がありません',
      );
    }

    // アーカイブ済みの Project にはメンバーを追加できない。
    const project = await this.findOne(projectId);
    if (project.isArchived) {
      throw new ConflictException(
        'アーカイブ済みのプロジェクトにメンバーを追加できません',
      );
    }

    // メールアドレスから追加対象のアプリ側 User を取得する。
    const targetUser = await this.projectsRepository.findUserByEmail(email);
    if (!targetUser) {
      throw new NotFoundException('追加対象のユーザーが見つかりません');
    }

    // 実行者ではなく、追加対象の参加情報で重複を確認する。
    const targetProjectMember = await this.projectsRepository.findProjectMember(
      projectId,
      targetUser.id,
    );
    if (targetProjectMember) {
      throw new ConflictException('指定したユーザーはすでに参加しています');
    }

    try {
      const result = await this.projectsRepository.createProjectMember({
        projectId,
        userId: targetUser.id,
        role,
      });

      // 保存直前にロックして確認した Project の状態を応答に反映する。
      if (result.status === 'project_not_found') {
        throw new NotFoundException('プロジェクトが見つかりません');
      }

      if (result.status === 'project_archived') {
        throw new ConflictException(
          'アーカイブ済みのプロジェクトにメンバーを追加できません',
        );
      }

      return result.member;
    } catch (error) {
      // 事前確認の後に別リクエストが追加していた場合も409を返す。
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('指定したユーザーはすでに参加しています');
      }

      throw error;
    }
  }

  async updateProjectMemberRole(
    projectId: string,
    projectMemberId: string,
    role: Exclude<ProjectMemberRole, typeof ProjectMemberRole.owner>,
    userId: string,
  ) {
    const projectMember = await this.projectsRepository.findProjectMember(
      projectId,
      userId,
    );

    // 対象の情報を確認する前に、実行者の参加情報と owner 権限を確認する。
    if (!projectMember) {
      throw new NotFoundException('プロジェクトが見つかりません');
    }

    if (projectMember.role !== ProjectMemberRole.owner) {
      throw new ForbiddenException(
        'プロジェクトのメンバーの role を変更する権限がありません',
      );
    }

    const project = await this.findOne(projectId);
    if (project.isArchived) {
      throw new ConflictException(
        'アーカイブ済みのプロジェクトではメンバーの role を変更できません',
      );
    }

    const targetProjectMember =
      await this.projectsRepository.findProjectMemberById(
        projectId,
        projectMemberId,
      );
    if (!targetProjectMember) {
      throw new NotFoundException('変更対象のメンバーが見つかりません');
    }

    if (targetProjectMember.role === ProjectMemberRole.owner) {
      throw new ConflictException('owner の role は変更できません');
    }

    // 同じ role の場合も保存側へ進み、ロック取得後の最新状態で判定する。
    const result = await this.projectsRepository.updateProjectMemberRole({
      projectId,
      projectMemberId,
      role,
    });

    if (result.status === 'project_not_found') {
      throw new NotFoundException('プロジェクトが見つかりません');
    }

    if (result.status === 'project_archived') {
      throw new ConflictException(
        'アーカイブ済みのプロジェクトではメンバーの role を変更できません',
      );
    }

    if (result.status === 'member_not_found') {
      throw new NotFoundException('変更対象のメンバーが見つかりません');
    }

    if (result.status === 'owner_protected') {
      throw new ConflictException('owner の role は変更できません');
    }

    return result.member;
  }

  async deleteProjectMember(
    projectId: string,
    projectMemberId: string,
    userId: string,
  ): Promise<void> {
    const projectMember = await this.projectsRepository.findProjectMember(
      projectId,
      userId,
    );

    // 削除対象を調べる前に、実行者の参加情報と owner 権限を確認する。
    if (!projectMember) {
      throw new NotFoundException('プロジェクトが見つかりません');
    }

    if (projectMember.role !== ProjectMemberRole.owner) {
      throw new ForbiddenException(
        'プロジェクトのメンバーを削除する権限がありません',
      );
    }

    const project = await this.findOne(projectId);
    if (project.isArchived) {
      throw new ConflictException(
        'アーカイブ済みのプロジェクトではメンバーを削除できません',
      );
    }

    const targetProjectMember =
      await this.projectsRepository.findProjectMemberById(
        projectId,
        projectMemberId,
      );

    if (!targetProjectMember) {
      throw new NotFoundException('削除対象のメンバーが見つかりません');
    }

    if (targetProjectMember.role === ProjectMemberRole.owner) {
      throw new ConflictException('owner は削除できません');
    }

    const result = await this.projectsRepository.deleteProjectMember({
      projectId,
      projectMemberId,
    });

    // ロック取得後に確認した結果を、HTTP エラーに変換する。
    if (result.status === 'project_not_found') {
      throw new NotFoundException('プロジェクトが見つかりません');
    }

    if (result.status === 'project_archived') {
      throw new ConflictException(
        'アーカイブ済みのプロジェクトではメンバーを削除できません',
      );
    }

    if (result.status === 'member_not_found') {
      throw new NotFoundException('削除対象のメンバーが見つかりません');
    }

    if (result.status === 'owner_protected') {
      throw new ConflictException('owner は削除できません');
    }
  }

  async update(id: string, dto: UpdateProjectDto, userId: string) {
    const projectMember = await this.projectsRepository.findProjectMember(
      id,
      userId,
    );

    // 参加情報がなければ404を返す。
    if (!projectMember) {
      throw new NotFoundException('プロジェクトが見つかりません');
    }
    // role が owner 以外なら403を返す。
    if (projectMember.role !== ProjectMemberRole.owner) {
      throw new ForbiddenException('プロジェクトを更新する権限がありません');
    }

    // PATCH の本文が {} の場合は、更新内容がないので拒否する
    if (dto.name === undefined && dto.description === undefined) {
      throw new BadRequestException('更新する項目を指定してください');
    }

    return await this.projectsRepository.update(id, {
      // undefined の項目は更新データに含めない
      ...(dto.name !== undefined && {
        name: dto.name.trim(),
      }),

      // 空文字・null は「説明なし」を表す null に統一する
      ...(dto.description !== undefined && {
        description: dto.description?.trim() || null,
      }),
    });
  }

  async archive(id: string, userId: string) {
    const projectMember = await this.projectsRepository.findProjectMember(
      id,
      userId,
    );

    // 参加情報がなければ404を返す。
    if (!projectMember) {
      throw new NotFoundException('プロジェクトが見つかりません');
    }
    // role が owner 以外なら403を返す。
    if (projectMember.role !== ProjectMemberRole.owner) {
      throw new ForbiddenException(
        'プロジェクトをアーカイブする権限がありません',
      );
    }

    return await this.projectsRepository.archive(id);
  }

  async unarchive(id: string, userId: string) {
    const projectMember = await this.projectsRepository.findProjectMember(
      id,
      userId,
    );

    // 参加情報がなければ404を返す。
    if (!projectMember) {
      throw new NotFoundException('プロジェクトが見つかりません');
    }
    // role が owner 以外なら403を返す。
    if (projectMember.role !== ProjectMemberRole.owner) {
      throw new ForbiddenException(
        'プロジェクトのアーカイブを解除する権限がありません',
      );
    }

    return await this.projectsRepository.unarchive(id);
  }
}
