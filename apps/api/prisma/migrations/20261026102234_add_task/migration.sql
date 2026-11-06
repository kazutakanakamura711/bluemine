-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('todo', 'in_progress', 'done');

-- CreateEnum
CREATE TYPE "TaskPriority" AS ENUM ('low', 'normal', 'high');

-- CreateTable
CREATE TABLE "tasks" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "TaskStatus" NOT NULL DEFAULT 'todo',
    "priority" "TaskPriority" NOT NULL DEFAULT 'normal',
    "start_date" DATE,
    "due_date" DATE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tasks_project_id_created_at_id_idx" ON "tasks"("project_id", "created_at", "id");

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
