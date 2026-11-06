import { ProjectDetailResponseDto } from './dto/project-detail-response.dto.js';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiBearerAuth,
  ApiUnauthorizedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
} from '@nestjs/swagger';
import { ProjectsService } from './projects.service.js';
import { CreateProjectDto } from './dto/create-project.dto.js';
import { ProjectResponseDto } from './dto/project-response.dto.js';
import { UpdateProjectDto } from './dto/update-project.dto.js';
import { type AuthenticatedRequest, AuthGuard } from '../auth/auth.guard.js';
import { ProjectMemberResponseDto } from './dto/project-member-response.dto.js';
import { CreateProjectMemberDto } from './dto/create-project-member.dto.js';
import { UpdateProjectMemberRoleDto } from './dto/update-project-member-role.dto.js';

type ProjectResponseData = Omit<
  ProjectResponseDto,
  'createdAt' | 'updatedAt'
> & {
  createdAt: Date;
  updatedAt: Date;
};

// DBの内部カラムを公開せず、Project APIの返却項目と日時形式を揃える。
function toProjectResponse(project: ProjectResponseData): ProjectResponseDto {
  return {
    id: project.id,
    ownerId: project.ownerId,
    name: project.name,
    key: project.key,
    description: project.description,
    isArchived: project.isArchived,
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
  };
}

@ApiTags('Projects')
@ApiBearerAuth()
@ApiUnauthorizedResponse({
  description: 'Bearer token がない、形式が不正、または token が無効',
})
@ApiForbiddenResponse({
  description: 'メールアドレスが未設定または未確認',
})
@Controller('projects')
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Get()
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: '参加しているプロジェクト一覧を取得する' })
  @ApiOkResponse({
    description:
      '参加しているプロジェクトを作成日時の新しい順で返す。アーカイブ済みも含み、参加していなければ空配列を返す',
    type: ProjectResponseDto,
    isArray: true,
  })
  async findAll(
    @Req() request: AuthenticatedRequest,
  ): Promise<ProjectResponseDto[]> {
    const projects = await this.projectsService.findAll(request.user.id);
    return projects.map(toProjectResponse);
  }

  @Get(':projectId')
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: '参加しているプロジェクト詳細を取得する' })
  @ApiParam({
    name: 'projectId',
    description: '取得するプロジェクトの ID',
    example: 'cmua3r1ik00032ed8lasbg1jj',
  })
  @ApiOkResponse({
    description: 'プロジェクト詳細と閲覧者自身の role を返す',
    type: ProjectDetailResponseDto,
  })
  @ApiNotFoundResponse({
    description: '指定したプロジェクトが存在しない、または参加していない',
  })
  async findOneForMember(
    @Param('projectId') projectId: string,
    @Req() request: AuthenticatedRequest,
  ): Promise<ProjectDetailResponseDto> {
    const project = await this.projectsService.findOneForMember(
      projectId,
      request.user.id,
    );
    return {
      ...toProjectResponse(project),
      currentUserRole: project.currentUserRole,
    };
  }

  @Get(':projectId/members')
  @UseGuards(AuthGuard)
  @ApiOperation({
    summary: '参加しているプロジェクトのメンバー一覧を取得する',
  })
  @ApiParam({
    name: 'projectId',
    description: '取得するプロジェクトの ID',
  })
  @ApiOkResponse({
    description:
      'owner・member・viewer にメンバー一覧を返す。アーカイブ済みも閲覧できる',
    type: ProjectMemberResponseDto,
    isArray: true,
  })
  @ApiForbiddenResponse({
    description: 'メールアドレスが未設定・未確認',
  })
  @ApiNotFoundResponse({
    description: '指定したプロジェクトが存在しない、または参加していない',
  })
  findProjectMembers(
    @Param('projectId') projectId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.projectsService.findProjectMembers(projectId, request.user.id);
  }

  @Post(':projectId/members')
  @UseGuards(AuthGuard)
  @ApiOperation({
    summary: 'プロジェクトにメンバーを追加する（owner のみ）',
    description:
      'アプリ側 User に登録済みのユーザーを、メールアドレスで指定して追加する。メールアドレスは前後の空白を除き、大文字・小文字を区別する。role は member・viewer のみ指定でき、アーカイブ済みのプロジェクトには追加できない。',
  })
  @ApiParam({
    name: 'projectId',
    description: 'メンバーを追加するプロジェクトの ID',
  })
  @ApiCreatedResponse({
    description: '追加したメンバーを返す',
    type: ProjectMemberResponseDto,
  })
  @ApiBadRequestResponse({
    description:
      'メールアドレス・role が不正、必須項目が未指定、または定義外の項目が指定されている',
  })
  @ApiForbiddenResponse({
    description:
      'メールアドレスが未設定・未確認、または参加者の role が owner 以外',
  })
  @ApiNotFoundResponse({
    description:
      '指定したプロジェクトが存在しない、参加していない、または追加対象のアプリ側 User が存在しない',
  })
  @ApiConflictResponse({
    description:
      'プロジェクトがアーカイブ済み、または追加対象のユーザーがすでに参加している',
  })
  addProjectMember(
    @Param('projectId') projectId: string,
    @Body() dto: CreateProjectMemberDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.projectsService.addProjectMember(
      projectId,
      dto.email,
      dto.role,
      request.user.id,
    );
  }

  @Patch(':projectId/members/:memberId')
  @UseGuards(AuthGuard)
  @ApiOperation({
    summary: 'プロジェクトのメンバーの role を変更する（owner のみ）',
    description:
      '指定した ProjectMember の role を member・viewer に変更する。アーカイブ済みのプロジェクトでは変更できず、owner 自身の role 変更もできない。同じ role を指定した場合は、参加情報と更新日時を変更せずに成功する。',
  })
  @ApiParam({
    name: 'projectId',
    description: 'メンバーの role を変更するプロジェクトの ID',
  })
  @ApiParam({
    name: 'memberId',
    description: '変更対象の ProjectMember の ID。User の ID とは異なる',
  })
  @ApiOkResponse({
    description:
      'role 変更後のメンバーを返す。同じ role の場合は現在のメンバーを返す',
    type: ProjectMemberResponseDto,
  })
  @ApiBadRequestResponse({
    description:
      'role が未指定、値・型が不正、または定義外の項目が指定されている',
  })
  @ApiForbiddenResponse({
    description:
      'メールアドレスが未設定・未確認、または参加者の role が owner 以外',
  })
  @ApiNotFoundResponse({
    description:
      '指定したプロジェクトが存在しない、参加していない、または対象の ProjectMember が指定したプロジェクト内に存在しない',
  })
  @ApiConflictResponse({
    description: 'プロジェクトがアーカイブ済み、または変更対象の role が owner',
  })
  updateProjectMemberRole(
    @Param('projectId') projectId: string,
    @Param('memberId') projectMemberId: string,
    @Body() dto: UpdateProjectMemberRoleDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.projectsService.updateProjectMemberRole(
      projectId,
      projectMemberId,
      dto.role,
      request.user.id,
    );
  }

  @Delete(':projectId/members/:memberId')
  @UseGuards(AuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'プロジェクトのメンバーを削除する（owner のみ）',
    description:
      '指定した ProjectMember の参加情報だけを削除し、User・Supabase Auth アカウントは保持する。アーカイブ済みのプロジェクトでは削除できず、owner 自身も削除できない。リクエスト本文は使用しない。',
  })
  @ApiParam({
    name: 'projectId',
    description: 'メンバーを削除するプロジェクトの ID',
  })
  @ApiParam({
    name: 'memberId',
    description: '削除対象の ProjectMember の ID。User の ID とは異なる',
  })
  @ApiNoContentResponse({
    description: '参加情報を削除する。レスポンス本文は返さない',
  })
  @ApiForbiddenResponse({
    description:
      'メールアドレスが未設定・未確認、または参加者の role が owner 以外',
  })
  @ApiNotFoundResponse({
    description:
      '指定したプロジェクトが存在しない、参加していない、または対象の ProjectMember が指定したプロジェクト内に存在しない。削除済みの ID も対象不在として扱う',
  })
  @ApiConflictResponse({
    description:
      'プロジェクトがアーカイブ済み、または削除対象の role が owner。アーカイブ済みの判定を優先する',
  })
  async deleteProjectMember(
    @Param('projectId') projectId: string,
    @Param('memberId') projectMemberId: string,
    @Req() request: AuthenticatedRequest,
  ): Promise<void> {
    await this.projectsService.deleteProjectMember(
      projectId,
      projectMemberId,
      request.user.id,
    );
  }

  @Post()
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'プロジェクトを作成する' })
  @ApiCreatedResponse({
    description: 'プロジェクトを作成して返す',
    type: ProjectResponseDto,
  })
  @ApiBadRequestResponse({ description: 'リクエスト本文が不正' })
  @ApiConflictResponse({
    description: 'プロジェクトキーがすでに使用されている',
  })
  async create(
    @Body() dto: CreateProjectDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<ProjectResponseDto> {
    const project = await this.projectsService.create(dto, request.user.id);
    return toProjectResponse(project);
  }

  @Patch(':projectId')
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'プロジェクトを更新する（owner のみ）' })
  @ApiParam({
    name: 'projectId',
    description: '更新するプロジェクトの ID',
  })
  @ApiOkResponse({
    description: 'プロジェクトを更新して返す',
    type: ProjectResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'リクエスト本文が不正、または更新項目が指定されていない',
  })
  @ApiForbiddenResponse({
    description:
      'メールアドレスが未設定・未確認、または参加者の role が owner 以外',
  })
  @ApiNotFoundResponse({
    description: '指定したプロジェクトが存在しない、または参加していない',
  })
  async update(
    @Param('projectId') projectId: string,
    @Body() dto: UpdateProjectDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<ProjectResponseDto> {
    const project = await this.projectsService.update(
      projectId,
      dto,
      request.user.id,
    );
    return toProjectResponse(project);
  }

  @Post(':projectId/archive')
  @UseGuards(AuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'プロジェクトをアーカイブする（owner のみ）' })
  @ApiParam({
    name: 'projectId',
    description: 'アーカイブするプロジェクトの ID',
  })
  @ApiOkResponse({
    description: 'プロジェクトをアーカイブして返す',
    type: ProjectResponseDto,
  })
  @ApiForbiddenResponse({
    description:
      'メールアドレスが未設定・未確認、または参加者の role が owner 以外',
  })
  @ApiNotFoundResponse({
    description: '指定したプロジェクトが存在しない、または参加していない',
  })
  async archive(
    @Param('projectId') projectId: string,
    @Req() request: AuthenticatedRequest,
  ): Promise<ProjectResponseDto> {
    const project = await this.projectsService.archive(
      projectId,
      request.user.id,
    );
    return toProjectResponse(project);
  }

  @Post(':projectId/unarchive')
  @UseGuards(AuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'プロジェクトのアーカイブを解除する（owner のみ）',
  })
  @ApiParam({
    name: 'projectId',
    description: 'アーカイブを解除するプロジェクトの ID',
  })
  @ApiOkResponse({
    description: 'プロジェクトのアーカイブを解除して返す',
    type: ProjectResponseDto,
  })
  @ApiForbiddenResponse({
    description:
      'メールアドレスが未設定・未確認、または参加者の role が owner 以外',
  })
  @ApiNotFoundResponse({
    description: '指定したプロジェクトが存在しない、または参加していない',
  })
  async unarchive(
    @Param('projectId') projectId: string,
    @Req() request: AuthenticatedRequest,
  ): Promise<ProjectResponseDto> {
    const project = await this.projectsService.unarchive(
      projectId,
      request.user.id,
    );
    return toProjectResponse(project);
  }
}
