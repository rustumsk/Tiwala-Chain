using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace TiwalaChain.API.Migrations
{
    /// <inheritdoc />
    public partial class AddJobDisputes : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "job_disputes",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    ContractHash = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    OnChainJobId = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    RaisedByWallet = table.Column<string>(type: "character varying(44)", maxLength: 44, nullable: false),
                    ReasonCode = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    Details = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_job_disputes", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_job_disputes_ContractHash",
                table: "job_disputes",
                column: "ContractHash",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "job_disputes");
        }
    }
}
