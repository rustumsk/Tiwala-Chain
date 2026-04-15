using System;
using System.Collections.Generic;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace TiwalaChain.API.Migrations
{
    /// <inheritdoc />
    public partial class AddJobPostingsMarketplace : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "PostingId",
                table: "jobs",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "ProposalId",
                table: "jobs",
                type: "integer",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "job_postings",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    EmployerWallet = table.Column<string>(type: "character varying(44)", maxLength: 44, nullable: false),
                    Title = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    Summary = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    Description = table.Column<string>(type: "character varying(8000)", maxLength: 8000, nullable: true),
                    Category = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    Skills = table.Column<List<string>>(type: "text[]", nullable: false),
                    JobType = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    BudgetType = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    BudgetMin = table.Column<decimal>(type: "numeric(18,6)", nullable: true),
                    BudgetMax = table.Column<decimal>(type: "numeric(18,6)", nullable: true),
                    Timeline = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    ExperienceLevel = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    Visibility = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    ProposalDeadline = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    BriefAttachmentKey = table.Column<string>(type: "character varying(512)", maxLength: 512, nullable: true),
                    ScreeningQuestionsJson = table.Column<string>(type: "character varying(4000)", maxLength: 4000, nullable: true),
                    Status = table.Column<string>(type: "text", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    PublishedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    ClosedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    ProposalCount = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_job_postings", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "notifications",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    RecipientWallet = table.Column<string>(type: "character varying(44)", maxLength: 44, nullable: false),
                    Type = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    Message = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: false),
                    DataJson = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    IsRead = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    ReadAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_notifications", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "proposals",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    PostingId = table.Column<int>(type: "integer", nullable: false),
                    FreelancerWallet = table.Column<string>(type: "character varying(44)", maxLength: 44, nullable: false),
                    CoverLetter = table.Column<string>(type: "character varying(4000)", maxLength: 4000, nullable: true),
                    ProposedAmount = table.Column<decimal>(type: "numeric(18,6)", nullable: false),
                    EstimatedTimeline = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    PortfolioLinksJson = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true),
                    RelevantExperience = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true),
                    ScreeningAnswersJson = table.Column<string>(type: "character varying(4000)", maxLength: 4000, nullable: true),
                    Status = table.Column<string>(type: "text", nullable: false),
                    RejectionReason = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    ViewedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    ConvertedJobId = table.Column<int>(type: "integer", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_proposals", x => x.Id);
                    table.ForeignKey(
                        name: "FK_proposals_job_postings_PostingId",
                        column: x => x.PostingId,
                        principalTable: "job_postings",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "proposal_messages",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    ProposalId = table.Column<int>(type: "integer", nullable: false),
                    SenderWallet = table.Column<string>(type: "character varying(44)", maxLength: 44, nullable: false),
                    Body = table.Column<string>(type: "character varying(4000)", maxLength: 4000, nullable: false),
                    MessageType = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    ReadAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_proposal_messages", x => x.Id);
                    table.ForeignKey(
                        name: "FK_proposal_messages_proposals_ProposalId",
                        column: x => x.ProposalId,
                        principalTable: "proposals",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_jobs_PostingId",
                table: "jobs",
                column: "PostingId");

            migrationBuilder.CreateIndex(
                name: "IX_jobs_ProposalId",
                table: "jobs",
                column: "ProposalId");

            migrationBuilder.CreateIndex(
                name: "IX_job_postings_Category",
                table: "job_postings",
                column: "Category");

            migrationBuilder.CreateIndex(
                name: "IX_job_postings_EmployerWallet",
                table: "job_postings",
                column: "EmployerWallet");

            migrationBuilder.CreateIndex(
                name: "IX_job_postings_Status",
                table: "job_postings",
                column: "Status");

            migrationBuilder.CreateIndex(
                name: "IX_notifications_RecipientWallet",
                table: "notifications",
                column: "RecipientWallet");

            migrationBuilder.CreateIndex(
                name: "IX_notifications_RecipientWallet_IsRead",
                table: "notifications",
                columns: new[] { "RecipientWallet", "IsRead" });

            migrationBuilder.CreateIndex(
                name: "IX_proposal_messages_ProposalId",
                table: "proposal_messages",
                column: "ProposalId");

            migrationBuilder.CreateIndex(
                name: "IX_proposals_FreelancerWallet",
                table: "proposals",
                column: "FreelancerWallet");

            migrationBuilder.CreateIndex(
                name: "IX_proposals_PostingId_FreelancerWallet",
                table: "proposals",
                columns: new[] { "PostingId", "FreelancerWallet" },
                unique: true,
                filter: "\"Status\" <> 'Withdrawn'");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "notifications");

            migrationBuilder.DropTable(
                name: "proposal_messages");

            migrationBuilder.DropTable(
                name: "proposals");

            migrationBuilder.DropTable(
                name: "job_postings");

            migrationBuilder.DropIndex(
                name: "IX_jobs_PostingId",
                table: "jobs");

            migrationBuilder.DropIndex(
                name: "IX_jobs_ProposalId",
                table: "jobs");

            migrationBuilder.DropColumn(
                name: "PostingId",
                table: "jobs");

            migrationBuilder.DropColumn(
                name: "ProposalId",
                table: "jobs");
        }
    }
}
