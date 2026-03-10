using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TiwalaChain.API.Migrations
{
    /// <inheritdoc />
    public partial class AddJobAmountUsdt : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<decimal>(
                name: "AmountUsdt",
                table: "jobs",
                type: "numeric(18,6)",
                nullable: false,
                defaultValue: 0m);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "AmountUsdt",
                table: "jobs");
        }
    }
}
